package expo.modules.haloisland

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ArgbEvaluator
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewTreeObserver
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.dynamicanimation.animation.DynamicAnimation
import androidx.dynamicanimation.animation.SpringAnimation
import androidx.dynamicanimation.animation.SpringForce
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * The cross-app island: a pill drawn over other apps that morphs into the expanded layout.
 * Owns only presentation; taps go back to JS as actions through [HaloIslandModule.dispatch].
 */
internal class OverlayIsland(private val context: Context) {
  private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private val handler = Handler(Looper.getMainLooper())
  private val density = context.resources.displayMetrics.density
  private val statusBarInset = context.resources.getIdentifier("status_bar_height", "dimen", "android")
    .takeIf { it > 0 }?.let(context.resources::getDimensionPixelSize) ?: dp(28)
  private val compactMinWidth = dp(120)
  /** Grows with the system font size so large text never clips. */
  private var compactHeight = dp(38)
  /** Read live: rotation and foldables change the width under a running island. */
  private val expandedWidth get() = min(context.resources.displayMetrics.widthPixels - dp(16), dp(400))

  private var root: FrameLayout? = null
  private var params: WindowManager.LayoutParams? = null
  private val compactHost = FrameLayout(context)
  private val expandedHost = FrameLayout(context)
  private var compactWidth = compactMinWidth
  private var isExpanded = false
  private var entry: Islands.Entry? = null
  private val values = mutableMapOf<String, Float>()
  private val autoCollapse = Runnable { setExpanded(false) }
  private var glow: ValueAnimator? = null

  fun show(next: Islands.Entry) {
    if (entry?.id != next.id) {
      values.clear()
      if (isExpanded) setExpanded(false)
    }
    entry = next
    if (root == null) attach()
    render()
  }

  /** An alerting update: open up and give a little shake. */
  fun alert() {
    val container = root ?: return
    setExpanded(true)
    scheduleAutoCollapse()
    container.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
    if (animationsEnabled()) {
      ObjectAnimator.ofFloat(container, View.ROTATION, 0f, 2.5f, -2.5f, 2.5f, 0f).setDuration(360).start()
    }
  }

  fun remove() {
    glow?.cancel()
    glow = null
    handler.removeCallbacksAndMessages(null)
    root?.let { view ->
      view.animate().alpha(0f).scaleX(0.86f).scaleY(0.86f).setDuration(if (animationsEnabled()) 180L else 0L)
        .withEndAction { runCatching { windowManager.removeView(view) } }.start()
    }
    root = null
    params = null
    entry = null
    isExpanded = false
  }

  // region Layout

  private fun attach() {
    val container = FrameLayout(context).apply {
      elevation = dp(16).toFloat()
      clipToOutline = true
      addView(compactHost, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
      addView(expandedHost.apply { visibility = View.GONE }, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
    }
    installGestures(compactHost)
    installGestures(expandedHost)
    val layoutParams = WindowManager.LayoutParams(
      compactMinWidth,
      compactHeight,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      // Overlays can't receive touches in the status bar region, so the pill sits just below it.
      y = statusBarInset + dp(4)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
    }
    windowManager.addView(container, layoutParams)
    root = container
    params = layoutParams
    container.alpha = 0f
    container.scaleX = 0.6f
    container.scaleY = 0.6f
    container.animate().alpha(1f).setDuration(if (animationsEnabled()) 160L else 0L).start()
    spring(container, 1f, 1f)
  }

  private fun render() {
    val current = entry ?: return
    val container = root ?: return
    val theme = Theme(current.template.optJSONObject("theme"))
    val renderer = Renderer(context, theme, current.state, values) { action ->
      HaloIslandModule.dispatch(context, current.id, action)
      scheduleAutoCollapse()
    }
    container.background = islandBackground(current, if (isExpanded) dp(theme.radius.toInt()).toFloat() else compactHeight / 2f)

    val compactRow = compactRow(renderer, current, "c")
    compactHost.removeAllViews()
    compactHost.addView(compactRow, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    val unspecified = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
    compactRow.measure(unspecified, unspecified)
    compactHeight = max(dp(38), compactRow.measuredHeight + dp(10))
    compactWidth = compactRow.measuredWidth.coerceIn(compactMinWidth, expandedWidth)

    // Expanded = the compact row as a header, then the body — the same layout iOS uses.
    expandedHost.removeAllViews()
    renderer.build(current.template.optJSONObject("expanded"), "e")?.let { body ->
      val column = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(6), dp(4), dp(6), dp(12))
        addView(compactRow(renderer, current, "h"), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, compactHeight))
        addView(body, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
          setMargins(dp(12), dp(8), dp(12), 0)
        })
      }
      expandedHost.addView(column, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
    }
    container.contentDescription = describe(current)
    syncGlow(current)
    resize()
  }

  private fun islandBackground(current: Islands.Entry, radius: Float): android.graphics.drawable.GradientDrawable {
    val json = current.template.optJSONObject("theme")
    val theme = Theme(json)
    val colors = json?.optJSONArray("gradient")?.let { a -> (0 until a.length()).mapNotNull { runCatching { android.graphics.Color.parseColor(a.getString(it)) }.getOrNull() } }
    val drawable = if (colors != null && colors.size > 1) android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.TL_BR, colors.toIntArray())
    else android.graphics.drawable.GradientDrawable().apply { setColor(theme.background) }
    drawable.cornerRadius = radius
    drawable.setStroke(dp(1), theme.border)
    return drawable
  }

  /** Breathes the border between the theme border and the glow color. */
  private fun syncGlow(current: Islands.Entry) {
    val theme = current.template.optJSONObject("theme")
    val color = theme?.optString("glow")?.takeIf { it.isNotEmpty() }?.let { runCatching { android.graphics.Color.parseColor(it) }.getOrNull() }
    if (color == null || !animationsEnabled()) {
      glow?.cancel()
      glow = null
      return
    }
    if (glow != null) return
    val base = Theme(theme).border
    glow = ValueAnimator.ofObject(ArgbEvaluator(), base, color).apply {
      duration = 1400
      repeatCount = ValueAnimator.INFINITE
      repeatMode = ValueAnimator.REVERSE
      addUpdateListener { (root?.background as? android.graphics.drawable.GradientDrawable)?.setStroke(dp(1) + 1, it.animatedValue as Int) }
      start()
    }
  }

  private fun compactRow(renderer: Renderer, current: Islands.Entry, path: String): LinearLayout {
    val compact = current.template.optJSONObject("compact")
    return LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(12), 0, dp(12), 0)
      renderer.build(compact?.optJSONObject("leading"), "${path}0")?.let { addView(it) }
      addView(View(context), LinearLayout.LayoutParams(dp(16), 1, 1f))
      renderer.build(compact?.optJSONObject("trailing"), "${path}1")?.let { addView(it) }
    }
  }

  private fun resize() {
    val container = root ?: return
    val p = params ?: return
    val width = if (isExpanded) expandedWidth else compactWidth
    val height = if (isExpanded) measuredExpandedHeight() else compactHeight
    if (p.width == width && p.height == height) return
    p.width = width
    p.height = height
    runCatching { windowManager.updateViewLayout(container, p) }
  }

  private fun measuredExpandedHeight(): Int {
    expandedHost.measure(
      View.MeasureSpec.makeMeasureSpec(expandedWidth, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
    )
    return max(compactHeight, expandedHost.measuredHeight)
  }

  // endregion

  // region Gestures & morph

  private fun installGestures(view: View) {
    val slop = ViewConfiguration.get(context).scaledTouchSlop
    var downY = 0f
    var moved = false
    var longPressed = false
    val longPress = Runnable {
      longPressed = true
      view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
      setExpanded(true)
    }
    view.setOnTouchListener { _, event ->
      val container = root ?: return@setOnTouchListener false
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downY = event.rawY
          moved = false
          longPressed = false
          handler.postDelayed(longPress, 420L)
          container.animate().scaleX(0.97f).scaleY(0.97f).setDuration(90L).start()
        }
        MotionEvent.ACTION_MOVE -> {
          val delta = event.rawY - downY
          if (abs(delta) > slop) { moved = true; handler.removeCallbacks(longPress) }
          // Rubber band: follows the finger, resisting harder the further it goes.
          container.translationY = delta.coerceIn(-dp(40).toFloat(), dp(40).toFloat()) * 0.5f
        }
        MotionEvent.ACTION_UP -> {
          handler.removeCallbacks(longPress)
          val delta = event.rawY - downY
          settle(container)
          when {
            longPressed -> Unit
            delta > dp(24) -> setExpanded(true)
            delta < -dp(24) -> setExpanded(false)
            !moved -> onTap()
          }
        }
        MotionEvent.ACTION_CANCEL -> { handler.removeCallbacks(longPress); settle(container) }
      }
      true
    }
  }

  private fun onTap() {
    val current = entry ?: return
    if (!isExpanded && current.template.has("expanded")) return setExpanded(true)
    HaloIslandModule.openApp(context, current.template.optString("link").takeIf { it.isNotEmpty() })
    setExpanded(false)
  }

  private fun settle(container: View) {
    container.animate().cancel()
    spring(container, 1f, 1f)
    SpringAnimation(container, DynamicAnimation.TRANSLATION_Y, 0f).apply { spring.applyMotion() }.start()
  }

  private fun setExpanded(expanded: Boolean) {
    if (isExpanded == expanded || root == null) return
    if (expanded && entry?.template?.has("expanded") != true) return
    handler.removeCallbacks(autoCollapse)
    isExpanded = expanded
    root?.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    if (expanded) expand() else collapse()
  }

  /** The window jumps to full size; scale makes it read as the pill growing into it. */
  private fun expand() {
    val container = root ?: return
    val theme = Theme(entry?.template?.optJSONObject("theme"))
    val height = measuredExpandedHeight()
    resize()
    container.background = islandBackground(entry ?: return, dp(theme.radius.toInt()).toFloat())
    compactHost.visibility = View.GONE
    expandedHost.visibility = View.VISIBLE
    container.pivotX = expandedWidth / 2f
    container.pivotY = 0f
    container.scaleX = compactWidth.toFloat() / expandedWidth
    container.scaleY = compactHeight.toFloat() / height
    expandedHost.alpha = 0f
    expandedHost.translationY = -dp(8).toFloat()
    spring(container, 1f, 1f)
    expandedHost.animate().alpha(1f).translationY(0f).setStartDelay(if (animationsEnabled()) 70L else 0L).setDuration(if (animationsEnabled()) 200L else 0L).start()
    scheduleAutoCollapse()
  }

  private fun collapse() {
    val container = root ?: return
    val p = params ?: return
    val finish = {
      expandedHost.visibility = View.GONE
      compactHost.visibility = View.VISIBLE
      compactHost.alpha = 0f
      // Reset the shrink only after relayout at compact size; doing it earlier draws one frame of
      // the wide layout pinned left in the narrow window (a visible jump).
      container.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
        override fun onPreDraw(): Boolean {
          if (container.width > compactWidth) return true
          container.viewTreeObserver.removeOnPreDrawListener(this)
          container.scaleX = 1f
          container.scaleY = 1f
          render()
          compactHost.animate().alpha(1f).setDuration(if (animationsEnabled()) 140L else 0L).start()
          return true
        }
      })
      resize()
    }
    if (!animationsEnabled()) return finish()
    expandedHost.animate().alpha(0f).setDuration(110L).start()
    container.animate()
      .scaleX(compactWidth.toFloat() / expandedWidth)
      .scaleY(compactHeight.toFloat() / max(1, p.height))
      .setDuration(230L)
      .setInterpolator(DecelerateInterpolator(1.4f))
      .setListener(object : AnimatorListenerAdapter() {
        override fun onAnimationEnd(animation: Animator) {
          container.animate().setListener(null)
          finish()
        }
      })
      .start()
  }

  private fun scheduleAutoCollapse() {
    handler.removeCallbacks(autoCollapse)
    handler.postDelayed(autoCollapse, 8_000L)
  }

  // endregion

  /** Same physics as the in-app renderer: JS sends {stiffness, damping} with mass 1. */
  private fun SpringForce.applyMotion() {
    val motion = entry?.template?.optJSONObject("motion")
    val stiffness = motion?.optDouble("stiffness", 380.0) ?: 380.0
    val damping = motion?.optDouble("damping", 24.2) ?: 24.2
    setStiffness(stiffness.toFloat())
    dampingRatio = (damping / (2 * sqrt(stiffness))).toFloat().coerceIn(0.05f, 1f)
  }

  private fun spring(view: View, scaleX: Float, scaleY: Float) {
    if (!animationsEnabled() || entry?.template?.optString("motion") == "none") {
      view.scaleX = scaleX
      view.scaleY = scaleY
      return
    }
    SpringAnimation(view, DynamicAnimation.SCALE_X, scaleX).apply { spring.applyMotion() }.start()
    SpringAnimation(view, DynamicAnimation.SCALE_Y, scaleY).apply { spring.applyMotion() }.start()
  }

  private fun describe(current: Islands.Entry): String {
    val texts = mutableListOf<String>()
    current.template.optJSONObject("compact")?.let { c ->
      listOf("leading", "trailing").forEach { key -> c.optJSONObject(key)?.walk { if (it.optString("type") == "text") texts += fill(it.optString("text"), current.state) } }
    }
    return texts.joinToString(", ")
  }

  private fun animationsEnabled() = ValueAnimator.areAnimatorsEnabled()
  private fun dp(value: Int) = (value * density).toInt()
}
