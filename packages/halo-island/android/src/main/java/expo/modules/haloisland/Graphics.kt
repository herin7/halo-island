package expo.modules.haloisland

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
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
      // Thin bars are capsules; wide ones keep a small radius, or every value draws as a circle.
      val r = min(w / 2, 4 * density)
      val h = max(2 * r, height * v)
      val x = i * (w + gap)
      rect.set(x, height - h, x + w, height.toFloat())
      paint.color = if (i < active) color else track
      canvas.drawRoundRect(rect, r, r, paint)
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

/** A sparkline: a smooth curve through 0–1 values, a soft gradient under it and a glowing head. */
internal class SparklineView(context: Context, private val ink: Int, private val thicknessDp: Float, private val fillArea: Boolean) : View(context) {
  private val density = resources.displayMetrics.density
  private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND; color = ink }
  private val areaPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val line = Path()
  private val area = Path()
  private var shown = FloatArray(0)

  /** Eases from the current shape to the new one, like the in-app sparkline. */
  fun set(next: FloatArray) {
    val from = if (shown.size == next.size) shown.copyOf() else next.copyOf()
    if (!ValueAnimator.areAnimatorsEnabled() || from.contentEquals(next)) { shown = next.copyOf(); invalidate(); return }
    ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 600
      interpolator = DecelerateInterpolator(1.6f)
      addUpdateListener { a -> val t = a.animatedValue as Float; shown = FloatArray(next.size) { from[it] + (next[it] - from[it]) * t }; invalidate() }
      start()
    }
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    areaPaint.shader = LinearGradient(0f, 0f, 0f, h.toFloat(), withAlpha(ink, 0.35f), withAlpha(ink, 0f), Shader.TileMode.CLAMP)
  }

  override fun onDraw(canvas: Canvas) {
    val n = shown.size
    if (n == 0) return
    val stroke = thicknessDp * density
    val pad = stroke + 3 * density
    val xs = FloatArray(n) { if (n > 1) pad + it * (width - pad * 2) / (n - 1) else width / 2f }
    val ys = FloatArray(n) { pad + (1 - shown[it].coerceIn(0f, 1f)) * (height - pad * 2) }
    // Catmull-Rom as cubic Béziers: the same curve as smooth() in graphics.tsx.
    line.reset()
    line.moveTo(xs[0], ys[0])
    for (i in 0 until n - 1) {
      val p = max(0, i - 1)
      val q = min(n - 1, i + 2)
      line.cubicTo(xs[i] + (xs[i + 1] - xs[p]) / 6, ys[i] + (ys[i + 1] - ys[p]) / 6, xs[i + 1] - (xs[q] - xs[i]) / 6, ys[i + 1] - (ys[q] - ys[i]) / 6, xs[i + 1], ys[i + 1])
    }
    if (fillArea) {
      area.set(line)
      area.lineTo(xs[n - 1], height.toFloat())
      area.lineTo(xs[0], height.toFloat())
      area.close()
      canvas.drawPath(area, areaPaint)
    }
    linePaint.strokeWidth = stroke
    canvas.drawPath(line, linePaint)
    dotPaint.color = withAlpha(ink, 0.25f)
    canvas.drawCircle(xs[n - 1], ys[n - 1], stroke * 2.6f, dotPaint)
    dotPaint.color = ink
    canvas.drawCircle(xs[n - 1], ys[n - 1], stroke * 1.3f, dotPaint)
  }
}

/**
 * Eye shapes in units of the pet's size, two eyes of six: width, top bulge, bottom bulge,
 * outer/inner corner lift, drop. Mirrors EYES in graphics.tsx; keep them in step.
 */
private val PET_IDLE = floatArrayOf(0.2f, 0.34f, 0.34f, 0f, 0f, 0f)
private val PET_HAPPY = floatArrayOf(0.3f, 0.3f, -0.13f, 0f, 0f, 0.05f)
private fun twin(e: FloatArray) = e + e
private val PET_EYES = mapOf(
  "idle" to twin(PET_IDLE),
  "happy" to twin(PET_HAPPY),
  "love" to twin(PET_HAPPY),
  "sleepy" to twin(floatArrayOf(0.3f, 0.04f, 0.07f, 0.02f, 0f, 0.1f)),
  "surprised" to twin(floatArrayOf(0.34f, 0.26f, 0.26f, 0f, 0f, -0.02f)),
  "thinking" to floatArrayOf(0.18f, 0.3f, 0.3f, 0f, 0f, 0f) + floatArrayOf(0.18f, 0.24f, 0.3f, 0f, 0f, 0f),
  "wink" to PET_HAPPY + PET_IDLE,
  "sad" to twin(floatArrayOf(0.24f, 0.24f, 0.3f, 0.06f, -0.08f, 0.04f)),
  "focused" to twin(floatArrayOf(0.26f, 0.12f, 0.3f, -0.03f, 0.07f, 0.02f)),
)
private val PET_BLUSH = setOf("love", "happy", "wink")

/**
 * The pet over other apps: two eyes that blink and morph between moods. There is no finger to
 * follow outside the app, so it looks straight ahead (thinking glances up and away).
 */
internal class PetView(context: Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val path = Path()
  private val oval = RectF()
  private var mood = "idle"
  private var from = PET_EYES.getValue("idle")
  private var to = from
  private var t = 1f
  private var blink = 1f
  private var color = Color.WHITE
  private var cheeks = Color.WHITE
  private var morph: ValueAnimator? = null
  private val blinker = object : Runnable {
    override fun run() {
      // Sometimes a double blink.
      ValueAnimator.ofFloat(1f, 0.05f, 1f).apply {
        duration = 190
        repeatCount = if (Math.random() < 0.2) 1 else 0
        addUpdateListener { blink = it.animatedValue as Float; invalidate() }
        start()
      }
      postDelayed(this, (1800 + Math.random() * 3200).toLong())
    }
  }

  fun set(next: String, color: Int, cheeks: Int) {
    this.color = color
    this.cheeks = cheeks
    val mood = next.takeIf { it in PET_EYES } ?: "idle"
    if (mood == this.mood) return invalidate()
    from = current()
    to = PET_EYES.getValue(mood)
    this.mood = mood
    morph?.cancel()
    if (!ValueAnimator.areAnimatorsEnabled()) { t = 1f; return invalidate() }
    t = 0f
    morph = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 520
      interpolator = OvershootInterpolator(1.6f)
      addUpdateListener { t = it.animatedValue as Float; invalidate() }
      start()
    }
  }

  private fun current() = FloatArray(12) { from[it] + (to[it] - from[it]) * t }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (ValueAnimator.areAnimatorsEnabled()) postDelayed(blinker, 1200)
  }

  override fun onDetachedFromWindow() {
    removeCallbacks(blinker)
    super.onDetachedFromWindow()
  }

  override fun onDraw(canvas: Canvas) {
    val s = height.toFloat()
    val e = current()
    val lx = if (mood == "thinking") 0.6f else 0f
    val ly = when (mood) { "thinking" -> -0.8f; "sleepy" -> 0.2f; else -> 0f }
    if (mood in PET_BLUSH) {
      paint.color = withAlpha(cheeks, 0.55f)
      for (side in intArrayOf(-1, 1)) {
        val cx = width / 2f + side * s * 0.52f
        oval.set(cx - s * 0.11f, s * 0.68f, cx + s * 0.11f, s * 0.8f)
        canvas.drawOval(oval, paint)
      }
    }
    paint.color = if (mood == "love") cheeks else color
    for (left in booleanArrayOf(true, false)) {
      val cx = width / 2f + (if (left) -1 else 1) * s * 0.3f + lx * s * 0.14f
      val cy = s / 2 + ly * s * 0.1f
      eye(e, if (left) 0 else 6, s, cx, cy, !left)
      canvas.drawPath(path, paint)
    }
  }

  /** Same curve as eyePath() in graphics.tsx: one cubic for each lid. */
  private fun eye(e: FloatArray, o: Int, s: Float, cx: Float, cy: Float, mirror: Boolean) {
    val w = e[o] * s
    val top = e[o + 1] * s * blink
    val bottom = e[o + 2] * s * min(blink, 1f)
    val outer = e[o + 3] * s
    val inner = e[o + 4] * s
    val y = cy + e[o + 5] * s
    val lx = cx - w / 2
    val rx = cx + w / 2
    val ly = y - (if (mirror) inner else outer)
    val ry = y - (if (mirror) outer else inner)
    path.reset()
    path.moveTo(lx, ly)
    path.cubicTo(lx, y - top, rx, y - top, rx, ry)
    path.cubicTo(rx, y + bottom, lx, y + bottom, lx, ly)
    path.close()
  }
}

/** "0.2,0.5,{x}" or a JSON array → floats. */
internal fun parseValues(raw: Any?, state: org.json.JSONObject): FloatArray = when (raw) {
  is org.json.JSONArray -> FloatArray(raw.length()) { num(raw.opt(it), state) }
  is String -> fill(raw, state).split(',').mapNotNull { it.trim().toFloatOrNull() }.toFloatArray()
  else -> FloatArray(0)
}
