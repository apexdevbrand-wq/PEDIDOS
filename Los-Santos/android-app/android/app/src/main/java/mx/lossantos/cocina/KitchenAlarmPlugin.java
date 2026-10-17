package mx.lossantos.cocina;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Alarma de Cocina. Suena por el canal de ALARMA de Android (no el de multimedia),
 * sube ese canal al máximo mientras suena y restaura el volumen anterior al parar.
 * Solo funciona con la app abierta: no es un servicio en segundo plano.
 */
@CapacitorPlugin(name = "KitchenAlarm")
public class KitchenAlarmPlugin extends Plugin {

    private static final long[] VIBRATION = { 0, 600, 400 };
    private MediaPlayer player;
    private int previousVolume = -1;

    @PluginMethod
    public void start(PluginCall call) {
        try {
            startAlarm();
            call.resolve(currentStatus());
        } catch (Exception e) {
            stopAlarm();
            call.reject("No se pudo iniciar la alarma: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopAlarm();
        call.resolve(currentStatus());
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        getActivity()
            .runOnUiThread(() -> {
                if (enabled) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(currentStatus());
    }

    @Override
    protected void handleOnDestroy() {
        stopAlarm();
    }

    private synchronized void startAlarm() throws Exception {
        if (player != null) return;
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audio != null) {
            previousVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM);
            try {
                audio.setStreamVolume(AudioManager.STREAM_ALARM, audio.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
            } catch (SecurityException ignored) {
                // Algunos equipos lo impiden en modo No molestar; suena con el volumen de alarma actual.
                previousVolume = -1;
            }
        }
        MediaPlayer mp = new MediaPlayer();
        mp.setAudioAttributes(
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        );
        try (AssetFileDescriptor sound = getContext().getResources().openRawResourceFd(R.raw.alarma)) {
            mp.setDataSource(sound.getFileDescriptor(), sound.getStartOffset(), sound.getLength());
        }
        mp.setLooping(true);
        mp.prepare();
        mp.start();
        player = mp;
        vibrate();
    }

    private synchronized void stopAlarm() {
        if (player != null) {
            try {
                player.stop();
            } catch (IllegalStateException ignored) {}
            player.release();
            player = null;
        }
        Vibrator vibrator = vibrator();
        if (vibrator != null) vibrator.cancel();
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audio != null && previousVolume >= 0) {
            try {
                audio.setStreamVolume(AudioManager.STREAM_ALARM, previousVolume, 0);
            } catch (SecurityException ignored) {}
        }
        previousVolume = -1;
    }

    @SuppressWarnings("deprecation")
    private void vibrate() {
        Vibrator vibrator = vibrator();
        if (vibrator == null || !vibrator.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(VIBRATION, 0));
        } else {
            vibrator.vibrate(VIBRATION, 0);
        }
    }

    @SuppressWarnings("deprecation")
    private Vibrator vibrator() {
        return (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
    }

    private synchronized JSObject currentStatus() {
        JSObject result = new JSObject();
        result.put("ringing", player != null);
        return result;
    }
}
