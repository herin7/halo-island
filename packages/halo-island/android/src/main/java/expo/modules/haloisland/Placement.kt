package expo.modules.haloisland

import android.content.Context
import android.graphics.Rect
import android.graphics.Region
import android.os.Build
import android.view.DisplayCutout
import android.view.WindowManager
import kotlin.math.abs
import kotlin.math.max

/** A rectangle in display dp. */
data class Hole(val x: Float, val y: Float, val width: Float, val height: Float)

/** Where the overlay's compact pill sits, in display dp. */
data class Frame(val mode: String, val centerX: Float, val top: Float, val height: Float, val gap: Float, val hole: Hole?)

/**
 * The overlay's position. Same rules as placeIsland() in geometry.ts, plus the user's own nudge
 * (`theme.offsetX`/`offsetY`, dp) and `theme.placement`: `auto` wraps a centred camera and falls
 * back to below the status bar, `camera` and `below` force one.
 */
object Placement {
  private const val MAX_W = 160f
  private const val MAX_H = 60f
  private const val OFF_CENTRE = 40f
  private const val TOP_BAND = 40f
  private const val CLEAR = 3f

  /** Samsung reports a punch-hole as a strip from the top edge; the lens is the square at its bottom. */
  fun trueHole(hole: Hole): Hole =
    if (hole.y < 1 && hole.height > hole.width * 1.15f && hole.width <= MAX_W) Hole(hole.x, hole.y + hole.height - hole.width, hole.width, hole.width)
    else hole

  fun place(hole: Hole?, screenWidth: Float, statusBar: Float, safeTop: Float, pill: Float, mode: String = "below", offsetX: Float = 0f, offsetY: Float = 0f): Frame {
    val lens = hole?.takeIf { it.width > 0 && it.height > 0 }?.let(::trueHole)
    val centred = lens != null && lens.y >= 0 && lens.y < TOP_BAND &&
      abs(lens.x + lens.width / 2 - screenWidth / 2) < OFF_CENTRE && lens.width <= MAX_W && lens.height <= MAX_H
    val wrap = lens != null && when (mode) {
      "camera" -> lens.y < TOP_BAND && lens.width <= MAX_W && lens.height <= MAX_H
      "auto" -> centred
      else -> false
    }
    if (!wrap || lens == null) {
      return Frame("below", screenWidth / 2 + offsetX, max(statusBar, safeTop) + 4 + offsetY, pill, 16f, null)
    }
    var height = max(pill, lens.height + 8)
    var top = lens.y + lens.height / 2 - height / 2
    if (top < 2) {
      top = 2f
      height = max(height, lens.y + lens.height + CLEAR - top)
    }
    return Frame("wrap", lens.x + lens.width / 2 + offsetX, top + offsetY, height, lens.width + 12, lens)
  }

  /** The camera hole at the top of the display in dp, or null (none, landscape, API < 29). */
  fun hole(context: Context): Hole? {
    val cutout = cutout(context) ?: return null
    val band = cutout.boundingRects.firstOrNull { it.top == 0 && !it.isEmpty } ?: return null
    // The path is the real lens (API 31+); the bounding rect is often padded.
    val lens = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      cutout.cutoutPath?.let { Region().apply { setPath(it, Region(band)) }.bounds.takeIf { r -> !r.isEmpty && band.contains(r) } }
    } else null
    return (lens ?: band).toDp(context)
  }

  /** Safe top inset of the cutout, dp. */
  fun safeTop(context: Context): Float = (cutout(context)?.safeInsetTop ?: 0) / context.resources.displayMetrics.density

  fun statusBar(context: Context): Float {
    val res = context.resources
    val id = res.getIdentifier("status_bar_height", "dimen", "android")
    return (if (id > 0) res.getDimensionPixelSize(id) else 0) / res.displayMetrics.density
  }

  private fun cutout(context: Context): DisplayCutout? {
    val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    return when {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ->
        wm.currentWindowMetrics.windowInsets.displayCutout
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ->
        @Suppress("DEPRECATION") wm.defaultDisplay.cutout
      else -> null
    }
  }

  private fun Rect.toDp(context: Context): Hole {
    val d = context.resources.displayMetrics.density
    return Hole(left / d, top / d, width() / d, height() / d)
  }
}
