package expo.modules.haloisland

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.ImageView
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.views.ExpoView
import org.json.JSONArray
import org.json.JSONObject
import java.io.Serializable

class StartOptions : Record {
  @Field var overlay: Boolean = false
  @Field var notification: Boolean = true
}

private class OverlayRequest(val packageName: String) : Serializable

private class OverlayContract(private val context: Context) : AppContextActivityResultContract<OverlayRequest, Boolean> {
  override fun createIntent(context: Context, input: OverlayRequest) =
    Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${input.packageName}"))

  override fun parseResult(input: OverlayRequest, resultCode: Int, intent: Intent?) = Settings.canDrawOverlays(context)
}

class HaloIslandModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private lateinit var overlayLauncher: AppContextActivityResultLauncher<OverlayRequest, Boolean>

  override fun definition() = ModuleDefinition {
    Name("HaloIsland")

    OnCreate { active = this@HaloIslandModule }
    OnDestroy { if (active === this@HaloIslandModule) active = null }

    RegisterActivityContracts {
      overlayLauncher = registerForActivityResult(OverlayContract(context))
    }

    Function("start") { id: String, template: String, state: String, options: StartOptions ->
      val ctx = context
      UiThreadUtil.runOnUiThread {
        Islands.start(ctx, Islands.Entry(id, JSONObject(template), JSONObject(state), options.overlay, options.notification))
      }
    }

    Function("update") { id: String, state: String, alert: Boolean ->
      val ctx = context
      UiThreadUtil.runOnUiThread { Islands.update(ctx, id, JSONObject(state), alert) }
    }

    Function("end") { id: String ->
      val ctx = context
      UiThreadUtil.runOnUiThread { Islands.end(ctx, id) }
    }

    Function("endAll") {
      val ctx = context
      UiThreadUtil.runOnUiThread { Islands.endAll(ctx) }
    }

    Function("capabilities") {
      val manager = Islands.manager(context)
      mapOf(
        "notifications" to (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
          ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED),
        "liveUpdates" to (Build.VERSION.SDK_INT >= 36 && manager.canPostPromotedNotifications()),
        "overlay" to Islands.canShowOverlay(context),
        "overlayDeclared" to IslandService.isDeclared(context),
        "liveActivities" to false
      )
    }

    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return@AsyncFunction promise.resolve(null)
      Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.POST_NOTIFICATIONS)
    }

    AsyncFunction("requestOverlayPermission") Coroutine { ->
      if (Settings.canDrawOverlays(context)) return@Coroutine true
      overlayLauncher.launch(OverlayRequest(context.packageName))
    }

    Function("openLiveUpdateSettings") {
      val intent = if (Build.VERSION.SDK_INT >= 36) Intent(Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS)
      else Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
      context.startActivity(intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("consumePendingActions") {
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val pending = JSONArray(prefs.getString(PENDING, "[]"))
      prefs.edit().remove(PENDING).apply()
      (0 until pending.length()).map { i ->
        pending.getJSONObject(i).let { mapOf("id" to it.getString("id"), "action" to it.getString("action")) }
      }
    }

    /** Top display cutout in dp, so the in-app island can grow out of the real camera hole. */
    Function("getCutout") {
      val activity = appContext.currentActivity ?: return@Function null
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return@Function null
      val cutout = activity.window.decorView.rootWindowInsets?.displayCutout ?: return@Function null
      val band = cutout.boundingRects.firstOrNull { it.top == 0 } ?: return@Function null
      // The bounding rect spans the whole inset band; the cutout path is the actual hole (API 31+).
      val hole = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        cutout.cutoutPath?.let { path ->
          android.graphics.RectF().also { path.computeBounds(it, true) }
            .takeIf { !it.isEmpty && it.top < band.bottom && it.height() <= band.height() }
        }
      } else null
      val rect = hole ?: android.graphics.RectF(band)
      val d = context.resources.displayMetrics.density
      mapOf("x" to rect.left / d, "y" to rect.top / d, "width" to rect.width() / d, "height" to rect.height() / d)
    }

    View(HaloIconView::class) {
      Prop("name") { view: HaloIconView, name: String? -> view.setName(name) }
      Prop("path") { view: HaloIconView, path: String? -> view.setPath(path) }
      Prop("viewBox") { view: HaloIconView, viewBox: Double? -> view.viewBox = viewBox?.toFloat() ?: 24f; view.refresh() }
      Prop("stroke") { view: HaloIconView, stroke: Double? -> view.stroke = stroke?.toFloat() ?: 0f; view.refresh() }
      Prop("color") { view: HaloIconView, color: String? ->
        view.setTint(color?.let { runCatching { Color.parseColor(it) }.getOrNull() } ?: Color.WHITE)
      }
    }
  }

  companion object {
    private const val PREFS = "halo_island"
    private const val PENDING = "pending_actions"
    private const val TASK = "HaloIslandAction"
    @Volatile private var active: HaloIslandModule? = null

    /**
     * Delivered as a headless task, not an event: Android pauses JS timers in the background
     * unless a task runs, so a fetch started by an island button would otherwise hang. If JS isn't
     * running at all, the action is kept until the app calls consumePendingActions().
     */
    internal fun dispatch(context: Context, id: String, action: String) {
      val react = active?.appContext?.reactContext as? ReactContext
      if (react == null) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val pending = JSONArray(prefs.getString(PENDING, "[]")).put(JSONObject().put("id", id).put("action", action))
        prefs.edit().putString(PENDING, pending.toString()).apply()
        return
      }
      val data = Arguments.createMap().apply {
        putString("id", id)
        putString("action", action)
      }
      UiThreadUtil.runOnUiThread {
        runCatching { HeadlessJsTaskContext.getInstance(react).startTask(HeadlessJsTaskConfig(TASK, data, 60_000L, true)) }
      }
    }

    internal fun openAppIntent(context: Context, link: String?): PendingIntent? {
      val intent = link?.let { Intent(Intent.ACTION_VIEW, Uri.parse(it)).setPackage(context.packageName) }
        ?: context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: return null
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      return PendingIntent.getActivity(context, link.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    internal fun openApp(context: Context, link: String?) {
      val intent = link?.let { Intent(Intent.ACTION_VIEW, Uri.parse(it)).setPackage(context.packageName) }
        ?: context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: return
      runCatching { context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)) }
    }
  }
}

/** Native icon for the in-app renderer, so in-app and system islands share one icon set. */
class HaloIconView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  // ExpoView stacks children like a LinearLayout; a FrameLayout lets both layers fill the view.
  private val layers = android.widget.FrameLayout(context).also { addView(it, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)) }
  private val image = ImageView(context).also { layers.addView(it, android.widget.FrameLayout.LayoutParams(-1, -1)) }
  private val vector = PathIconView(context).also { layers.addView(it, android.widget.FrameLayout.LayoutParams(-1, -1)) }
  private var path: String? = null
  private var tint = Color.WHITE
  var viewBox = 24f
  var stroke = 0f

  fun setName(name: String?) {
    val id = name?.let { drawableId(context, it) } ?: 0
    if (id != 0) image.setImageResource(id) else image.setImageDrawable(null)
  }

  fun setPath(value: String?) {
    path = value
    refresh()
  }

  // Never toggle child visibility here: React Native doesn't re-layout an ExpoView's own
  // children, so a view made visible later would stay 0x0. An empty path simply draws nothing.
  fun refresh() {
    vector.set(path ?: "", viewBox, stroke, tint)
    if (path != null) image.setImageDrawable(null)
  }

  fun setTint(color: Int) {
    tint = color
    image.imageTintList = ColorStateList.valueOf(color)
    vector.setTint(color)
  }
}

/** Separate module: one native view per module is what Expo resolves reliably. */
class HaloGraphicModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HaloGraphic")
    View(HaloGraphicView::class) {
      Prop("spec") { view: HaloGraphicView, spec: String -> view.setSpec(spec) }
    }
  }
}

/** Bars, arcs and timelines for the in-app renderer, drawn by the same views as the overlay. */
class HaloGraphicView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true
  private val previous = mutableMapOf<String, Float>()

  fun setSpec(json: String) {
    val spec = JSONObject(json)
    val view = Renderer(context, Theme(spec.optJSONObject("theme")), spec.optJSONObject("state") ?: JSONObject(), previous) {}
      .build(spec.optJSONObject("node"), "g") ?: return
    removeAllViews()
    addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }
}
