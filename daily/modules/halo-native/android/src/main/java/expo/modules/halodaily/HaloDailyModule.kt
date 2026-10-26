package expo.modules.halodaily

import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.core.content.IntentCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.HttpURLConnection
import java.net.URL

/** The few things Halo Daily needs from Android that JS can't do: steps, files, share, clipboard, prefs. */
class HaloDailyModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private var steps: SensorEventListener? = null
  private var alive = false

  override fun definition() = ModuleDefinition {
    Name("HaloDaily")
    Events("onSteps", "onShare")

    /** PKCE for "Sign in with Claude": a random verifier, its S256 challenge, and a state. */
    Function("pkce") {
      val random = java.security.SecureRandom()
      val b64 = { bytes: ByteArray -> android.util.Base64.encodeToString(bytes, android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP) }
      val verifier = b64(ByteArray(32).also(random::nextBytes))
      val challenge = b64(java.security.MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
      mapOf("verifier" to verifier, "challenge" to challenge, "state" to b64(ByteArray(32).also(random::nextBytes)))
    }

    /** Hex SHA-256: the checksum Kite's token exchange asks for. */
    Function("sha256") { text: String ->
      java.security.MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }
    }

    Function("load") { key: String -> prefs().getString(key, null) }
    Function("save") { key: String, value: String -> prefs().edit().putString(key, value).apply() }

    Function("hasStepSensor") { sensors().getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null }

    /** TYPE_STEP_COUNTER counts every step since boot, even while the app is dead; JS keeps the daily baseline. */
    Function("watchSteps") { on: Boolean ->
      val manager = sensors()
      steps?.let(manager::unregisterListener)
      steps = null
      val sensor = manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
      if (!on || sensor == null) return@Function false
      val listener = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) = sendEvent("onSteps", mapOf("total" to e.values[0].toDouble()))
        override fun onAccuracyChanged(s: Sensor?, accuracy: Int) {}
      }
      steps = listener
      // Batched up to 10 s: cheap on battery, still live enough for the island.
      manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, 10_000_000)
    }

    /**
     * Android pauses JS timers in the background unless a headless task runs. One task that never
     * finishes keeps the island's clock ticking while the overlay's foreground service keeps the
     * process alive.
     */
    Function("keepAlive") {
      val react = appContext.reactContext as? ReactContext
      if (react != null && !alive) {
        alive = true
        UiThreadUtil.runOnUiThread {
          runCatching { HeadlessJsTaskContext.getInstance(react).startTask(HeadlessJsTaskConfig("HaloDailyAlive", Arguments.createMap(), 0L, true)) }
            .onFailure { alive = false }
        }
      }
    }

    AsyncFunction("copy") { text: String ->
      clipboard().setPrimaryClip(ClipData.newPlainText("Halo", text))
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("paste") {
      clipboard().primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context)?.toString()
    }.runOnQueue(Queues.MAIN)

    /** Streams a file from the desk bridge into Downloads/Halo; returns its content uri. */
    AsyncFunction("download") { url: String, token: String, name: String, mime: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) throw Exception("Needs Android 10+")
      val resolver = context.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, name)
        put(MediaStore.Downloads.MIME_TYPE, mime)
        put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Halo")
        put(MediaStore.Downloads.IS_PENDING, 1)
      }
      val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw Exception("Can't create the file")
      try {
        val conn = connect(url, token)
        if (conn.responseCode != 200) throw Exception("Bridge answered ${conn.responseCode}")
        conn.inputStream.use { input -> resolver.openOutputStream(uri)!!.use { input.copyTo(it) } }
        resolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
      } catch (e: Exception) {
        resolver.delete(uri, null, null)
        throw e
      }
      uri.toString()
    }

    /** Streams shared content (a content:// uri) to the desk bridge without loading it into JS. */
    AsyncFunction("upload") { uri: String, url: String, token: String ->
      val conn = connect(url, token).apply {
        requestMethod = "POST"
        doOutput = true
        setChunkedStreamingMode(64 * 1024)
        setRequestProperty("content-type", "application/octet-stream")
      }
      context.contentResolver.openInputStream(Uri.parse(uri))!!.use { input -> conn.outputStream.use { input.copyTo(it) } }
      if (conn.responseCode != 200) throw Exception("Bridge answered ${conn.responseCode}")
    }

    Function("open") { uri: String, mime: String? ->
      val intent = Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uri), mime ?: "*/*")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      runCatching { context.startActivity(intent) }.isSuccess
    }

    /** Content shared to Halo from another app's share sheet: at launch, then on every new share. */
    Function("takeShared") { appContext.currentActivity?.intent?.let(::consume) }
    OnNewIntent { intent -> consume(intent)?.let { sendEvent("onShare", it) } }

    OnDestroy { steps?.let { runCatching { sensors().unregisterListener(it) } } }
  }

  private fun consume(intent: Intent): Map<String, Any?>? {
    if (intent.action != Intent.ACTION_SEND) return null
    intent.action = null // handled once, even if the activity is recreated
    val stream = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)
    var name: String? = null
    var size = 0L
    stream?.let { uri ->
      runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
          if (c.moveToFirst()) { name = c.getString(0); size = c.getLong(1) }
        }
      }
    }
    return mapOf("text" to intent.getStringExtra(Intent.EXTRA_TEXT), "uri" to stream?.toString(), "name" to name, "size" to size.toDouble(), "mime" to intent.type)
  }

  private fun connect(url: String, token: String) = (URL(url).openConnection() as HttpURLConnection).apply {
    setRequestProperty("x-halo-token", token)
    connectTimeout = 10_000
    readTimeout = 120_000
  }

  private fun prefs() = context.getSharedPreferences("halo_daily", Context.MODE_PRIVATE)
  private fun sensors() = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private fun clipboard() = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
}
