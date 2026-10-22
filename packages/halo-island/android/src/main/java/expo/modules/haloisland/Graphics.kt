package expo.modules.haloisland

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.view.View
import android.view.animation.DecelerateInterpolator
import androidx.core.content.ContextCompat
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Data graphics drawn natively. The overlay uses them directly; the in-app renderer embeds them
 * through HaloGraphicView, so both surfaces draw the same pixels.
 */

/** Rounded bars: a histogram, timer ticks, or (animate = true) a live audio waveform. */
internal class BarsView(context: Context, private val color: Int, private val track: Int, private val gapDp: Float, private val animateWave: Boolean) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val rect = RectF()
  private val density = resources.displayMetrics.density
  private var values = FloatArray(0)
  private var shown = FloatArray(0)
  private var active = Int.MAX_VALUE
  private var wave: ValueAnimator? = null

  fun set(next: FloatArray, activeCount: Int) {
    val from = if (shown.size == next.size) shown.copyOf() else next.copyOf()
    values = next
    active = activeCount
    if (!ValueAnimator.areAnimatorsEnabled()) { shown = next.copyOf(); invalidate(); return }
    ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 500
      interpolator = DecelerateInterpolator(1.6f)
      addUpdateListener { a -> val t = a.animatedValue as Float; shown = FloatArray(next.size) { from[it] + (next[it] - from[it]) * t }; invalidate() }
      start()
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (!animateWave || !ValueAnimator.areAnimatorsEnabled()) return
    wave = ValueAnimator.ofFloat(0f, (Math.PI * 2).toFloat()).apply {
      duration = 1200
      repeatCount = ValueAnimator.INFINITE
      interpolator = null
      addUpdateListener { invalidate() }
      start()
    }
  }

  override fun onDetachedFromWindow() {
    wave?.cancel()
    super.onDetachedFromWindow()
  }

  override fun onDraw(canvas: Canvas) {
    val n = shown.size
    if (n == 0) return
    val gap = gapDp * density
    val w = (width - gap * (n - 1)) / n
    val phase = (wave?.animatedValue as? Float) ?: 0f
    for (i in 0 until n) {
      var v = shown[i].coerceIn(0f, 1f)
      if (wave != null) v = (v * (0.55f + 0.45f * sin(phase + i * 0.9f).let { (it + 1) / 2 })).coerceIn(0.08f, 1f)
      val h = max(w, height * v)
      val x = i * (w + gap)
      rect.set(x, height - h, x + w, height.toFloat())
      paint.color = if (i < active) color else track
      canvas.drawRoundRect(rect, w / 2, w / 2, paint)
    }
  }
}

/** A shallow arc across the width — sun path, gauge, journey — filled to value, glowing marker. */
internal class ArcView(context: Context, private val colors: IntArray, private val track: Int, private val thicknessDp: Float, private val glow: Boolean) : View(context) {
  private val density = resources.displayMetrics.density
  private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; color = track }
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
  private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { maskFilter = BlurMaskFilter(14 * density, BlurMaskFilter.Blur.NORMAL) }
  private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
  private val oval = RectF()
  private var value = 0f

  init {
    // BlurMaskFilter needs a software layer.
    if (glow) setLayerType(LAYER_TYPE_SOFTWARE, null)
  }

  fun set(v: Float) { value = v.coerceIn(0f, 1f); invalidate() }

  override fun onDraw(canvas: Canvas) {
    val stroke = thicknessDp * density
    val pad = stroke + (if (glow) 10 * density else 0f)
    val chord = width - pad * 2
    val sag = max(1f, height - pad * 2)
    // Circle through both ends and the top: r = (s^2 + (c/2)^2) / 2s
    val r = (sag * sag + (chord / 2) * (chord / 2)) / (2 * sag)
    val cx = width / 2f
    val cy = pad + r
    oval.set(cx - r, cy - r, cx + r, cy + r)
    val half = Math.toDegrees(asin(min(1.0, (chord / 2 / r).toDouble()))).toFloat()
    val start = 270f - half
    val sweep = half * 2
    trackPaint.strokeWidth = stroke
    fillPaint.strokeWidth = stroke
    fillPaint.shader = if (colors.size > 1) LinearGradient(pad, 0f, width - pad, 0f, colors, null, Shader.TileMode.CLAMP) else null
    if (colors.size == 1) fillPaint.color = colors[0]
    canvas.drawArc(oval, start, sweep, false, trackPaint)
    if (value <= 0f) return
    canvas.drawArc(oval, start, sweep * value, false, fillPaint)
    val angle = Math.toRadians((start + sweep * value).toDouble())
    val mx = cx + r * cos(angle).toFloat()
    val my = cy + r * sin(angle).toFloat()
    if (glow) {
      glowPaint.color = colors.last()
      canvas.drawCircle(mx, my, stroke * 2.2f, glowPaint)
    }
    canvas.drawCircle(mx, my, stroke * 0.9f, dotPaint)
  }
}

/** Stages as icon nodes on a line: cooking → packed → on the way → home. */
internal class TimelineView(context: Context, private val icons: List<String>, private val color: Int, private val track: Int, private val ink: Int, private val nodeDp: Float) : View(context) {
  private val density = resources.displayMetrics.density
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val drawables = icons.map { name -> drawableId(context, name).takeIf { it != 0 }?.let { ContextCompat.getDrawable(context, it)?.mutate() } }
  private var value = 0f

  fun set(v: Float) { value = v; invalidate() }

  override fun onDraw(canvas: Canvas) {
    val n = icons.size
    if (n == 0) return
    val node = nodeDp * density
    val cy = height / 2f
    val step = if (n > 1) (width - node) / (n - 1) else 0f
    val line = node * 0.16f
    paint.color = track
    canvas.drawRoundRect(node / 2, cy - line / 2, width - node / 2, cy + line / 2, line, line, paint)
    // value counts stages: 1.5 = past the first node, halfway to the second.
    val reached = node / 2 + step * (value - 1).coerceIn(0f, (n - 1).toFloat())
    paint.color = color
    canvas.drawRoundRect(node / 2, cy - line / 2, max(node / 2, reached), cy + line / 2, line, line, paint)
    for (i in 0 until n) {
      val done = value >= i + 1 - 0.001f
      val x = node / 2 + step * i
      paint.color = if (done) color else track
      canvas.drawCircle(x, cy, node / 2, paint)
      drawables[i]?.let { d ->
        val s = (node * 0.56f).toInt()
        d.setBounds((x - s / 2).toInt(), (cy - s / 2).toInt(), (x + s / 2).toInt(), (cy + s / 2).toInt())
        d.setTint(if (done) ink else withAlpha(Color.WHITE, 0.55f))
        d.draw(canvas)
      }
    }
  }
}

/** "0.2,0.5,{x}" or a JSON array → floats. */
internal fun parseValues(raw: Any?, state: org.json.JSONObject): FloatArray = when (raw) {
  is org.json.JSONArray -> FloatArray(raw.length()) { num(raw.opt(it), state) }
  is String -> fill(raw, state).split(',').mapNotNull { it.trim().toFloatOrNull() }.toFloatArray()
  else -> FloatArray(0)
}
