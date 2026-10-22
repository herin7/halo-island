package expo.modules.haloisland

import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.Chronometer
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.net.URL
import kotlin.concurrent.thread
import kotlin.math.abs
import kotlin.math.max

/** Colors arrive from JS already normalized to #AARRGGBB. */
internal class Theme(json: JSONObject?) {
  val background = json.color("background", Color.BLACK)
  val foreground = json.color("foreground", Color.rgb(247, 247, 242))
  val secondary = json.color("secondary", Color.rgb(154, 160, 154))
  val accent = json.color("accent", Color.rgb(95, 203, 156))
  val border = json.color("border", Color.argb(26, 255, 255, 255))
  val radius = json?.optDouble("radius", 32.0)?.toFloat() ?: 32f
}

internal fun JSONObject?.color(key: String, fallback: Int): Int =
  this?.optString(key)?.takeIf { it.isNotEmpty() }?.let { runCatching { Color.parseColor(it) }.getOrNull() } ?: fallback

private val PLACEHOLDER = Regex("\\{(\\w+)\\}")

internal fun fill(value: String, state: JSONObject): String =
  PLACEHOLDER.replace(value) { m -> state.opt(m.groupValues[1])?.takeIf { it != JSONObject.NULL }?.toString() ?: "" }

internal fun num(value: Any?, state: JSONObject): Float = when (value) {
  is Number -> value.toFloat()
  is String -> fill(value, state).toFloatOrNull() ?: 0f
  else -> 0f
}

/** Depth-first walk, used to derive notification content from the same tree. */
internal fun JSONObject.walk(visit: (JSONObject) -> Unit) {
  visit(this)
  optJSONArray("children")?.let { for (i in 0 until it.length()) it.optJSONObject(i)?.walk(visit) }
}

internal fun drawableId(context: Context, name: String): Int {
  val res = context.resources
  return res.getIdentifier("halo_ic_$name", "drawable", context.packageName).takeIf { it != 0 }
    ?: res.getIdentifier(name, "drawable", context.packageName)
}

/**
 * Builds Android views for an island node. [previous] carries ring/bar values between renders so
 * a state update animates from the old value instead of jumping.
 */
internal class Renderer(
  private val context: Context,
  private val theme: Theme,
  private val state: JSONObject,
  private val previous: MutableMap<String, Float>,
  private val onAction: (String) -> Unit,
) {
  private val density = context.resources.displayMetrics.density

  fun build(node: JSONObject?, path: String = "0"): View? {
    node ?: return null
    val view = body(node, path) ?: return null
    node.optString("effect").takeIf { it.isNotEmpty() }?.let { loop(view, it) }
    return view
  }

  private fun body(node: JSONObject, path: String): View? {
    return when (node.optString("type")) {
      "row" -> box(node, LinearLayout.HORIZONTAL, path)
      "column" -> box(node, LinearLayout.VERTICAL, path)
      "text" -> label(fill(node.optString("text"), state), node.optJSONObject("style"))
      "icon" -> if (node.has("path")) PathIconView(context).apply {
          set(node.optString("path"), node.optDouble("viewBox", 24.0).toFloat(), node.optDouble("stroke", 0.0).toFloat(), node.color("color", theme.foreground))
        }.sized(node.optInt("size", 18))
        else icon(fill(node.optString("name"), state), node.optInt("size", 18), node.color("color", theme.foreground))
      "image" -> image(node)
      "ring" -> RingView(context, dp(node.optDouble("thickness", 3.0).toFloat()), node.color("color", theme.accent), node.color("track", withAlpha(node.color("color", theme.accent), 0.22f)))
        .also { animate(it::set, path, num(node.opt("value"), state)) }
        .sized(node.optInt("size", 22))
      "bar" -> BarView(context, node.color("color", theme.accent), node.color("track", withAlpha(node.color("color", theme.accent), 0.22f)))
        .also { animate(it::set, path, num(node.opt("value"), state)) }
      "steps" -> steps(node, path)
      "track" -> TrackView(context, node.color("color", theme.accent), node.color("track", withAlpha(node.color("color", theme.accent), 0.22f)), fill(node.optString("marker"), state), px(node.optInt("height", 4)))
        .also { animate(it::set, path, num(node.opt("value"), state)) }
      "lottie" -> lottie(node)
      "timer" -> timer(node)
      "button" -> button(node)
      "spacer" -> View(context)
      else -> null
    }
  }

  // region Layout

  private fun box(node: JSONObject, orientation: Int, path: String): View {
    val style = node.optJSONObject("style")
    val isRow = orientation == LinearLayout.HORIZONTAL
    val align = style?.optString("align")?.takeIf { it.isNotEmpty() } ?: if (isRow) "center" else "stretch"
    val justify = style?.optString("justify") ?: "start"
    val gap = dp(style?.optDouble("gap", 8.0)?.toFloat() ?: 8f).toInt()
    val layout = LinearLayout(context).apply {
      this.orientation = orientation
      val pad = dp(style?.optDouble("padding", 0.0)?.toFloat() ?: 0f).toInt()
      setPadding(pad, pad, pad, pad)
      val cross = when (align) {
        "start" -> if (isRow) Gravity.TOP else Gravity.START
        "end" -> if (isRow) Gravity.BOTTOM else Gravity.END
        "center" -> if (isRow) Gravity.CENTER_VERTICAL else Gravity.CENTER_HORIZONTAL
        else -> 0
      }
      val main = when (justify) {
        "center" -> if (isRow) Gravity.CENTER_HORIZONTAL else Gravity.CENTER_VERTICAL
        "end" -> if (isRow) Gravity.END else Gravity.BOTTOM
        else -> 0
      }
      gravity = cross or main
      style?.let { s ->
        if (s.has("background") || s.has("radius") || s.has("gradient") || s.has("border")) {
          background = surface(s, Color.TRANSPARENT, dp(s.optDouble("radius", 0.0).toFloat()))
        }
        if (s.has("opacity")) alpha = s.optDouble("opacity", 1.0).toFloat()
        if (s.has("width") || s.has("height")) {
          layoutParams = LinearLayout.LayoutParams(if (s.has("width")) px(s.optInt("width")) else wrap, if (s.has("height")) px(s.optInt("height")) else wrap)
        }
      }
    }
    val children = node.optJSONArray("children") ?: return layout
    for (i in 0 until children.length()) {
      val child = children.optJSONObject(i) ?: continue
      val view = build(child, "$path.$i") ?: continue
      val type = child.optString("type")
      val grows = child.optJSONObject("style")?.optBoolean("grow") == true ||
        (type in BARS && isRow) || (type == "spacer" && !child.has("size"))
      val stretch = !isRow && align == "stretch" && type !in FIXED_SIZE
      val explicit = view.layoutParams
      val params = when {
        grows && isRow -> LinearLayout.LayoutParams(0, explicit?.height ?: wrap, 1f)
        grows -> LinearLayout.LayoutParams(explicit?.width ?: match, 0, 1f)
        type == "spacer" -> child.optInt("size").let { s -> if (isRow) LinearLayout.LayoutParams(px(s), 1) else LinearLayout.LayoutParams(1, px(s)) }
        type in BARS -> LinearLayout.LayoutParams(match, barHeight(child))
        stretch -> LinearLayout.LayoutParams(match, explicit?.height ?: wrap)
        explicit != null -> LinearLayout.LayoutParams(explicit.width, explicit.height)
        else -> LinearLayout.LayoutParams(wrap, wrap)
      }
      if (layout.childCount > 0 && justify != "between") {
        if (isRow) params.marginStart = gap else params.topMargin = gap
      }
      if (layout.childCount > 0 && justify == "between") {
        layout.addView(View(context), if (isRow) LinearLayout.LayoutParams(gap, 1, 1f) else LinearLayout.LayoutParams(1, gap, 1f))
      }
      if (type in BARS && isRow) params.height = barHeight(child)
      layout.addView(view, params)
    }
    return layout
  }

  // endregion

  // region Leaves

  fun label(value: String, style: JSONObject?) = TextView(context).apply {
    text = value
    setTextSize(TypedValue.COMPLEX_UNIT_SP, style?.optDouble("size", 14.0)?.toFloat() ?: 14f)
    setTextColor(style.color("color", theme.foreground))
    typeface = font(style?.optString("font")) ?: typeface(style?.optString("weight"))
    includeFontPadding = false
    maxLines = style?.optInt("lines", 1) ?: 1
    ellipsize = TextUtils.TruncateAt.END
    if (style?.optBoolean("mono") == true) fontFeatureSettings = "tnum"
    gravity = when (style?.optString("align")) {
      "center" -> Gravity.CENTER_HORIZONTAL
      "end" -> Gravity.END
      else -> Gravity.START
    }
  }

  private fun icon(name: String, sizeDp: Int, tint: Int): View = ImageView(context).apply {
    val id = drawableId(context, name)
    if (id != 0) setImageResource(id)
    imageTintList = ColorStateList.valueOf(tint)
    contentDescription = name
  }.sized(sizeDp)

  private fun image(node: JSONObject): View {
    val view = ImageView(context).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      // An empty uri is a placeholder slot (e.g. a result that hasn't arrived yet).
      background = rounded(Color.argb(20, 255, 255, 255), dp(node.optDouble("radius", 8.0).toFloat()))
      clipToOutline = true
    }
    val uri = fill(node.optString("uri"), state)
    if (uri.startsWith("http")) {
      IMAGES[uri]?.let(view::setImageBitmap) ?: thread {
        val bitmap = runCatching { URL(uri).openStream().use(BitmapFactory::decodeStream) }.getOrNull() ?: return@thread
        IMAGES[uri] = bitmap
        MAIN.post { view.setImageBitmap(bitmap) }
      }
    } else if (uri.isNotEmpty()) {
      runCatching { view.setImageURI(Uri.parse(uri)) }
    }
    return view.sized(node.optInt("size", 32))
  }

  /** Looping motion; stops itself when the view leaves the window so rebuilt trees don't leak animators. */
  private fun loop(view: View, effect: String) {
    if (!ValueAnimator.areAnimatorsEnabled()) return
    val animator = when (effect) {
      "pulse" -> ObjectAnimator.ofPropertyValuesHolder(view, PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.14f), PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.14f)).apply { duration = 900 }
      "bounce" -> ObjectAnimator.ofFloat(view, View.TRANSLATION_Y, 0f, -dp(4f)).apply { duration = 420 }
      "spin" -> ObjectAnimator.ofFloat(view, View.ROTATION, 0f, 360f).apply { duration = 1100; interpolator = LinearInterpolator(); repeatMode = ValueAnimator.RESTART }
      "wiggle" -> ObjectAnimator.ofFloat(view, View.ROTATION, 0f, 10f, -10f, 10f, 0f, 0f, 0f, 0f, 0f, 0f).apply { duration = 1800; repeatMode = ValueAnimator.RESTART }
      "shimmer" -> ObjectAnimator.ofFloat(view, View.ALPHA, 1f, 0.5f).apply { duration = 900 }
      else -> return
    }
    animator.repeatCount = ValueAnimator.INFINITE
    if (effect == "pulse" || effect == "bounce" || effect == "shimmer") animator.repeatMode = ValueAnimator.REVERSE
    view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
      override fun onViewAttachedToWindow(v: View) = animator.start()
      override fun onViewDetachedFromWindow(v: View) = animator.cancel()
    })
  }

  /** Lottie only if the app ships it (lottie-react-native brings lottie-android). */
  private fun lottie(node: JSONObject): View? {
    if (!HAS_LOTTIE) return null
    return com.airbnb.lottie.LottieAnimationView(context).apply {
      setAnimationFromUrl(fill(node.optString("uri"), state))
      repeatCount = if (node.optBoolean("loop", true)) ValueAnimator.INFINITE else 0
      playAnimation()
    }.sized(node.optInt("size", 28))
  }

  private fun steps(node: JSONObject, path: String): View {
    val color = node.color("color", theme.accent)
    val track = node.color("track", withAlpha(color, 0.22f))
    val value = num(node.opt("value"), state)
    return LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      for (i in 0 until node.optInt("count", 1)) {
        val bar = BarView(context, color, track)
        animate(bar::set, "$path.s$i", value - i)
        addView(bar, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f).apply { if (i > 0) marginStart = px(4) })
      }
    }
  }

  private fun timer(node: JSONObject): View {
    val style = node.optJSONObject("style")
    val target = num(node.opt("to"), state).toLong()
    val countUp = node.optBoolean("countUp")
    return Chronometer(context).apply {
      setTextSize(TypedValue.COMPLEX_UNIT_SP, style?.optDouble("size", 14.0)?.toFloat() ?: 14f)
      setTextColor(style.color("color", theme.foreground))
      typeface = typeface(style?.optString("weight"))
      fontFeatureSettings = "tnum"
      includeFontPadding = false
      base = SystemClock.elapsedRealtime() + (target - System.currentTimeMillis())
      isCountDown = !countUp
      // A finished countdown would run into negative time; hold it at 0:00 instead.
      setOnChronometerTickListener { if (isCountDown && base <= SystemClock.elapsedRealtime()) { stop(); text = "0:00" } }
      start()
    }
  }

  private fun button(node: JSONObject): View {
    val bg = node.color("color", theme.accent)
    val ink = node.color("textColor", theme.background)
    val action = node.optString("action")
    val label = node.optString("label").takeIf { it.isNotEmpty() }?.let { fill(it, state) }
    return LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      minimumHeight = dp(38).toInt()
      val horizontal = dp(if (label == null) 10 else 16).toInt()
      setPadding(horizontal, 0, horizontal, 0)
      background = RippleDrawable(ColorStateList.valueOf(Color.argb(48, 255, 255, 255)), rounded(bg, dp(19)), null)
      isClickable = true
      contentDescription = label ?: action
      node.optString("icon").takeIf { it.isNotEmpty() }?.let { addView(icon(fill(it, state), 16, ink)) }
      label?.let {
        addView(this@Renderer.label(it, JSONObject().put("weight", "bold").put("size", 14)).apply { setTextColor(ink) },
          LinearLayout.LayoutParams(wrap, wrap).apply { if (childCount > 0) marginStart = dp(6).toInt() })
      }
      setOnClickListener {
        it.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
        onAction(action)
      }
    }.also { it.layoutParams = LinearLayout.LayoutParams(wrap, dp(38).toInt()) }
  }

  // endregion

  private fun animate(set: (Float) -> Unit, path: String, target: Float) {
    val to = target.coerceIn(0f, 1f)
    val from = previous[path] ?: to
    previous[path] = to
    if (abs(from - to) < 0.001f || !ValueAnimator.areAnimatorsEnabled()) return set(to)
    set(from)
    ValueAnimator.ofFloat(from, to).apply {
      duration = 600L
      interpolator = DecelerateInterpolator(1.6f)
      addUpdateListener { set(it.animatedValue as Float) }
      start()
    }
  }

  /** Box fill: gradient (135 degrees) or solid, with optional border — Figma frame parity. */
  private fun surface(s: JSONObject, fallback: Int, radius: Float): GradientDrawable {
    val colors = s.optJSONArray("gradient")?.let { a -> (0 until a.length()).mapNotNull { runCatching { Color.parseColor(a.getString(it)) }.getOrNull() } }
    val drawable = if (colors != null && colors.size > 1) GradientDrawable(GradientDrawable.Orientation.TL_BR, colors.toIntArray())
    else GradientDrawable().apply { setColor(s.color("background", fallback)) }
    drawable.cornerRadius = radius
    s.optJSONObject("border")?.let { b -> drawable.setStroke(px(b.optInt("width", 1)), b.color("color", theme.border)) }
    return drawable
  }

  /** App fonts: Android res/font/<name>, or assets/fonts/<name>.ttf|otf (where Expo puts them). */
  private fun font(name: String?): Typeface? {
    if (name.isNullOrEmpty()) return null
    FONTS[name]?.let { return it }
    val res = context.resources.getIdentifier(name.lowercase().replace('-', '_'), "font", context.packageName)
    val face = (if (res != 0) runCatching { androidx.core.content.res.ResourcesCompat.getFont(context, res) }.getOrNull() else null)
      ?: listOf("ttf", "otf").firstNotNullOfOrNull { ext -> runCatching { Typeface.createFromAsset(context.assets, "fonts/$name.$ext") }.getOrNull() }
    face?.let { FONTS[name] = it }
    return face
  }

  private fun typeface(weight: String?): Typeface {
    val w = when (weight) { "medium" -> 500; "semibold" -> 600; "bold" -> 700; "heavy" -> 800; else -> 400 }
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) Typeface.create(Typeface.DEFAULT, w, false)
    else if (w >= 600) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
  }

  private fun barHeight(node: JSONObject) = if (node.optString("type") == "track") px(24) else px(node.optInt("height", 4))

  private fun View.sized(sizeDp: Int) = apply { layoutParams = LinearLayout.LayoutParams(dp(sizeDp).toInt(), dp(sizeDp).toInt()) }
  private fun dp(value: Float) = value * density
  private fun dp(value: Int) = value * density
  private fun px(value: Int) = (value * density).toInt()

  companion object {
    private const val wrap = LinearLayout.LayoutParams.WRAP_CONTENT
    private const val match = LinearLayout.LayoutParams.MATCH_PARENT
    private val FIXED_SIZE = setOf("icon", "image", "ring", "spacer")
    private val BARS = setOf("bar", "steps", "track")
    private val FONTS = mutableMapOf<String, Typeface>()
    private val HAS_LOTTIE = runCatching { Class.forName("com.airbnb.lottie.LottieAnimationView") }.isSuccess
    private val MAIN = Handler(Looper.getMainLooper())
    // ponytail: unbounded, fine for a handful of avatars/artwork; LruCache if apps rotate many images.
    private val IMAGES = mutableMapOf<String, android.graphics.Bitmap>()
  }
}

internal fun rounded(color: Int, radius: Float, stroke: Int = 0, strokeWidth: Int = 0) = GradientDrawable().apply {
  cornerRadius = radius
  setColor(color)
  if (strokeWidth > 0) setStroke(strokeWidth, stroke)
}

internal fun withAlpha(color: Int, alpha: Float) =
  Color.argb((Color.alpha(color) * alpha).toInt(), Color.red(color), Color.green(color), Color.blue(color))

internal class RingView(context: Context, private val stroke: Float, color: Int, track: Int) : View(context) {
  private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = stroke; this.color = track }
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = stroke; strokeCap = Paint.Cap.ROUND; this.color = color }
  private val oval = RectF()
  private var value = 0f

  fun set(v: Float) { value = v; invalidate() }

  override fun onDraw(canvas: Canvas) {
    val inset = stroke / 2f + 1f
    oval.set(inset, inset, width - inset, height - inset)
    canvas.drawArc(oval, 0f, 360f, false, trackPaint)
    if (value > 0f) canvas.drawArc(oval, -90f, 360f * value, false, fillPaint)
  }
}

internal class BarView(context: Context, color: Int, track: Int) : View(context) {
  private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = track }
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
  private val rect = RectF()
  private var value = 0f

  fun set(v: Float) { value = v; invalidate() }

  override fun onDraw(canvas: Canvas) {
    val h = height.toFloat()
    rect.set(0f, 0f, width.toFloat(), h)
    canvas.drawRoundRect(rect, h / 2, h / 2, trackPaint)
    if (value <= 0f) return
    rect.set(0f, 0f, max(h, width * value), h)
    canvas.drawRoundRect(rect, h / 2, h / 2, fillPaint)
  }
}

/** A bar with a text marker riding along it. */
internal class TrackView(context: Context, color: Int, track: Int, marker: String, barHeight: Int) : FrameLayout(context) {
  private val bar = BarView(context, color, track)
  private val label = TextView(context).apply {
    text = marker
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
    includeFontPadding = false
  }
  private var value = 0f

  init {
    addView(bar, LayoutParams(LayoutParams.MATCH_PARENT, barHeight, Gravity.CENTER_VERTICAL))
    addView(label, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.CENTER_VERTICAL))
  }

  fun set(v: Float) {
    value = v
    bar.set(v)
    label.translationX = v * max(0, width - label.width)
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    super.onLayout(changed, l, t, r, b)
    label.translationX = value * max(0, width - label.width)
  }
}

/** Draws SVG path data scaled from a square viewBox. Fill by default, outline when stroke > 0. */
internal class PathIconView(context: Context) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
  private var path: android.graphics.Path? = null
  private var viewBox = 24f
  private var stroke = 0f
  private val scale = android.graphics.Matrix()
  private val scaled = android.graphics.Path()

  fun set(data: String, viewBox: Float, stroke: Float, color: Int) {
    path = runCatching { androidx.core.graphics.PathParser.createPathFromPathData(data) }.getOrNull()
    this.viewBox = viewBox
    this.stroke = stroke
    paint.color = color
    invalidate()
  }

  fun setTint(color: Int) {
    paint.color = color
    invalidate()
  }

  override fun onDraw(canvas: Canvas) {
    val p = path ?: return
    val factor = minOf(width, height) / viewBox
    scale.setScale(factor, factor)
    p.transform(scale, scaled)
    paint.style = if (stroke > 0f) Paint.Style.STROKE else Paint.Style.FILL
    paint.strokeWidth = stroke * factor
    canvas.drawPath(scaled, paint)
  }
}
