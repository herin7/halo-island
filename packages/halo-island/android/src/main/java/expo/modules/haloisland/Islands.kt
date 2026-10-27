package expo.modules.haloisland

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * Kotlin entry point, for apps that drive islands from native code (a notification listener, a
 * broadcast receiver, an FCM service) without starting JS. Call on the main thread.
 */
object HaloIsland {
  fun start(context: Context, id: String, template: JSONObject, state: JSONObject = JSONObject(), overlay: Boolean = true, notification: Boolean = false) =
    Islands.start(context, Islands.Entry(id, template, state, overlay, notification))

  fun update(context: Context, id: String, state: JSONObject, alert: Boolean = false) = Islands.update(context, id, state, alert)

  fun end(context: Context, id: String) = Islands.end(context, id)

  fun state(id: String): JSONObject? = Islands.get(id)?.state

  /**
   * Lets a long-lived component the system keeps alive (a NotificationListenerService, an
   * AccessibilityService) host the overlay instead of the foreground service, so no ongoing
   * notification is needed. Detach in its onDestroy.
   */
  fun attachHost(context: Context) = Islands.attachHost(context)

  fun detachHost(context: Context) = Islands.detachHost(context)

  /** Gets out of the way for [durationMs]: `fade` turns see-through and lets touches pass, `hide` slides it away. */
  fun dodge(mode: String = "fade", durationMs: Long = 5_000L) = Islands.overlay()?.dodge(mode, durationMs)

  /** Sees every action before JS does; return true to consume it. */
  @Volatile var actionHandler: ((id: String, action: String) -> Boolean)? = null

  /** True when the overlay is actually on screen right now. */
  fun overlayShowing(): Boolean = Islands.overlay()?.isShowing == true
}

/** Every running island in this process. The most recent overlay island owns the overlay. */
internal object Islands {
  class Entry(val id: String, val template: JSONObject, var state: JSONObject, val overlay: Boolean, val notification: Boolean)

  private val entries = LinkedHashMap<String, Entry>()
  /** Notification ids handed out per island id; hashing could collide two islands into one notification. */
  private val notificationIds = HashMap<String, Int>()
  private var host: OverlayIsland? = null

  fun start(context: Context, entry: Entry) {
    entries.remove(entry.id)
    entries[entry.id] = entry
    present(context, entry)
  }

  fun update(context: Context, id: String, state: JSONObject, alert: Boolean) {
    val entry = entries[id] ?: return
    entry.state = state
    present(context, entry)
    if (alert && overlayEntry() === entry) overlay()?.alert()
  }

  fun end(context: Context, id: String) {
    entries.remove(id) ?: return
    // Release the foreground service first: Android ignores cancel() on a live FGS notification.
    syncOverlay(context)
    manager(context).cancel(notificationId(id))
  }

  fun endAll(context: Context) {
    entries.keys.toList().forEach { end(context, it) }
  }

  fun get(id: String): Entry? = entries[id]

  fun overlayEntry(): Entry? = entries.values.lastOrNull { it.overlay }

  /** Whichever overlay is live: the attached host's, or the foreground service's. */
  fun overlay(): OverlayIsland? = host ?: IslandService.island()

  fun attachHost(context: Context) {
    if (host != null) return
    host = OverlayIsland(context.applicationContext)
    IslandService.stop(context)
    // Overlay-only islands needed a notification only to keep the service in the foreground.
    entries.values.filter { !it.notification }.forEach { manager(context).cancel(notificationId(it.id)) }
    syncOverlay(context)
  }

  fun detachHost(context: Context) {
    host?.remove() ?: return
    host = null
    entries.values.filter { it.overlay }.forEach { present(context, it) }
  }

  private fun present(context: Context, entry: Entry) {
    if (entry.notification || (entry.overlay && host == null)) {
      runCatching { manager(context).notify(notificationId(entry.id), Notifications.build(context, entry)) }
    }
    syncOverlay(context)
  }

  fun resync(context: Context) = syncOverlay(context)

  private fun syncOverlay(context: Context) {
    val top = overlayEntry()
    val host = host
    if (host != null) {
      if (top == null || !Settings.canDrawOverlays(context)) host.remove() else host.show(top)
      return
    }
    if (top == null || !canShowOverlay(context)) return IslandService.stop(context)
    IslandService.show(context, top)
  }

  fun canShowOverlay(context: Context) =
    Settings.canDrawOverlays(context) && (host != null || IslandService.isDeclared(context))

  fun notificationId(id: String) = notificationIds.getOrPut(id) { 0x4A10 + notificationIds.size }

  fun manager(context: Context) = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
}

/**
 * Derives a notification from the same tree: first texts become title/body, the first ring or bar
 * becomes progress, compact.trailing becomes the status-bar chip. On Android 16+ it is promoted to
 * a Live Update; below that it's a regular ongoing notification.
 */
internal object Notifications {
  private const val CHANNEL = "halo_island"

  fun build(context: Context, entry: Islands.Entry): android.app.Notification {
    ensureChannel(context)
    val t = entry.template
    val state = entry.state
    val theme = Theme(t.optJSONObject("theme"))
    val body = t.optJSONObject("lockScreen") ?: t.optJSONObject("expanded")
    val compact = t.optJSONObject("compact")

    val texts = mutableListOf<String>()
    var progress: Float? = null
    var segments = 1
    var timerTo: Long? = null
    var timerUp = false
    var iconName: String? = null
    val buttons = mutableListOf<JSONObject>()
    val visit: (JSONObject) -> Unit = { n ->
      when (n.optString("type")) {
        "text" -> fill(n.optString("text"), state).takeIf { it.isNotBlank() }?.let(texts::add)
        "ring", "bar" -> if (progress == null) progress = num(n.opt("value"), state).coerceIn(0f, 1f)
        "steps" -> if (progress == null) {
          segments = n.optInt("count", 1).coerceAtLeast(1)
          progress = (num(n.opt("value"), state) / segments).coerceIn(0f, 1f)
        }
        "timer" -> if (timerTo == null) { timerTo = num(n.opt("to"), state).toLong(); timerUp = n.optBoolean("countUp") }
        "icon" -> if (iconName == null) iconName = n.optString("name")
        // Weather art stands in as a cloud (or sun) in the status bar chip.
        "sky" -> if (iconName == null) iconName = if (fill(n.optString("condition"), state) == "clear") "sun" else "cloud"
        // A notification action fires on one tap, so confirm buttons and in-island navigation stay in-app.
        "button" -> if (!n.has("confirm") && n.optString("action").let { !it.startsWith("go:") && it != "back" && it != "close" }) buttons += n
      }
    }
    compact?.optJSONObject("leading")?.walk(visit)
    val chip = mutableListOf<String>()
    compact?.optJSONObject("trailing")?.walk { if (it.optString("type") == "text") chip += fill(it.optString("text"), state) }
    compact?.optJSONObject("trailing")?.walk(visit)
    val compactTexts = texts.size
    body?.walk(visit)
    // Prefer the body's own words; fall back to the compact ones if the body has none.
    val content = texts.drop(compactTexts).ifEmpty { texts }

    val builder = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(iconName?.let { drawableId(context, it) }?.takeIf { it != 0 } ?: R.drawable.halo_ic_bolt)
      .setContentTitle(content.getOrNull(0) ?: appLabel(context))
      .setContentText(content.getOrNull(1))
      .setSubText(content.getOrNull(2))
      .setColor(theme.accent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setContentIntent(HaloIslandModule.openAppIntent(context, t.optString("link").takeIf { it.isNotEmpty() }))

    timerTo?.let { to ->
      builder.setWhen(to).setShowWhen(true).setUsesChronometer(true)
      if (!timerUp) builder.setChronometerCountDown(true)
    }
    buttons.take(3).forEach { b ->
      val label = b.optString("label").takeIf { it.isNotEmpty() }?.let { fill(it, state) } ?: b.optString("action")
      builder.addAction(0, label, ActionReceiver.intent(context, entry.id, b.optString("action")))
    }

    val value = progress
    if (Build.VERSION.SDK_INT >= 36) {
      builder.setRequestPromotedOngoing(true)
      chip.firstOrNull { it.isNotBlank() }?.let { builder.setShortCriticalText(it) }
      if (value != null) {
        // Steps become real segments with a point at each stage boundary.
        val style = NotificationCompat.ProgressStyle().setStyledByProgress(true).setProgress((value * 100).roundToInt())
        val length = 100 / segments
        repeat(segments) { i ->
          style.addProgressSegment(NotificationCompat.ProgressStyle.Segment(if (i == segments - 1) 100 - length * i else length).setColor(theme.accent))
          if (i > 0) style.addProgressPoint(NotificationCompat.ProgressStyle.Point(length * i).setColor(theme.accent))
        }
        builder.setStyle(style)
      }
    } else if (value != null) {
      builder.setProgress(100, (value * 100).roundToInt(), false)
    }
    return builder.build()
  }

  /** Only ever shown for an instant, when the service has to start foreground with nothing to show. */
  fun placeholder(context: Context): android.app.Notification {
    ensureChannel(context)
    return NotificationCompat.Builder(context, CHANNEL).setSmallIcon(R.drawable.halo_ic_bolt).setSilent(true).build()
  }

  private fun ensureChannel(context: Context) {
    val manager = Islands.manager(context)
    if (manager.getNotificationChannel(CHANNEL) != null) return
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Live activities", NotificationManager.IMPORTANCE_DEFAULT).apply {
      setSound(null, null)
      enableVibration(false)
    })
  }

  private fun appLabel(context: Context) = context.applicationInfo.loadLabel(context.packageManager).toString()
}

/**
 * Keeps the overlay alive while the app is in the background. Declared by the config plugin only
 * when the app opts into the overlay, so apps that don't use it never ship the permissions.
 */
class IslandService : Service() {
  private var island: OverlayIsland? = null
  private var foregroundId: Int? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    active = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // startForegroundService() promised a startForeground() call. If the island ended before we
    // got here, keep the promise with a placeholder and leave, or Android kills the app.
    val entry = Islands.overlayEntry() ?: run {
      runCatching { ServiceCompat.startForeground(this, PLACEHOLDER_ID, Notifications.placeholder(this), serviceType()) }
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    present(entry)
    return START_NOT_STICKY
  }

  private fun present(entry: Islands.Entry) {
    val id = Islands.notificationId(entry.id)
    if (foregroundId != id) {
      runCatching { ServiceCompat.startForeground(this, id, Notifications.build(this, entry), serviceType()) }
        .onFailure { stopSelf(); return }
      foregroundId = id
    }
    (island ?: OverlayIsland(this).also { island = it }).show(entry)
  }

  private fun serviceType() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0

  override fun onDestroy() {
    island?.remove()
    island = null
    if (active === this) active = null
    super.onDestroy()
  }

  companion object {
    private const val PLACEHOLDER_ID = 0x4A0F
    @Volatile private var active: IslandService? = null

    internal fun island(): OverlayIsland? = active?.island

    internal fun isDeclared(context: Context) = runCatching {
      context.packageManager.getServiceInfo(ComponentName(context, IslandService::class.java), 0)
    }.isSuccess

    internal fun show(context: Context, entry: Islands.Entry) {
      active?.let { it.present(entry); return }
      // Throws if the app is in the background (Android 12+); the island appears on next foreground start.
      runCatching { ContextCompat.startForegroundService(context, Intent(context, IslandService::class.java)) }
    }

    internal fun stop(context: Context) {
      active?.let {
        // Keep the notification itself; Islands.end cancels it when the island really ends.
        ServiceCompat.stopForeground(it, ServiceCompat.STOP_FOREGROUND_DETACH)
        it.stopSelf()
      }
    }
  }
}

/** Notification buttons. Delivers the action without opening the app. */
class ActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(EXTRA_ID) ?: return
    val action = intent.getStringExtra(EXTRA_ACTION) ?: return
    HaloIslandModule.dispatch(context, id, action)
  }

  companion object {
    private const val EXTRA_ID = "halo.id"
    private const val EXTRA_ACTION = "halo.action"

    fun intent(context: Context, id: String, action: String): PendingIntent = PendingIntent.getBroadcast(
      context,
      "$id/$action".hashCode(),
      Intent(context, ActionReceiver::class.java).putExtra(EXTRA_ID, id).putExtra(EXTRA_ACTION, action),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
