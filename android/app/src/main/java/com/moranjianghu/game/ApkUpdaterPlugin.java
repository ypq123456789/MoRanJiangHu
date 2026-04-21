package com.moranjianghu.game;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    @PluginMethod
    public void getInstalledApkInfo(PluginCall call) {
        try {
            File sourceApk = new File(getContext().getApplicationInfo().sourceDir);
            JSObject result = new JSObject();
            result.put("filePath", sourceApk.getAbsolutePath());
            result.put("sha256", computeSha256(sourceApk));
            result.put("fileSize", sourceApk.length());
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        String versionName = call.getString("versionName", "latest");

        if (url == null || url.trim().isEmpty()) {
            call.reject("缺少 APK 下载地址。");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settingsIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settingsIntent);
            notifyErrorProgress("请先在系统中允许本应用安装未知来源应用，然后再重试更新。", versionName);
            call.reject("请先在系统中允许本应用安装未知来源应用，然后再重试更新。");
            return;
        }

        new Thread(() -> {
            try {
                notifyUpdateProgress("preparing", "正在准备下载更新包...", 0L, 0L, null, versionName);
                File apkFile = downloadApk(url, versionName);

                JSObject result = new JSObject();
                result.put("filePath", apkFile.getAbsolutePath());
                result.put("versionName", versionName);

                if (getActivity() == null) {
                    notifyErrorProgress("当前没有可用的 Activity。", versionName);
                    call.reject("当前没有可用的 Activity。");
                    return;
                }

                getActivity().runOnUiThread(() -> {
                    try {
                        notifyUpdateProgress("installing", "下载完成，正在拉起安装界面...", apkFile.length(), apkFile.length(), apkFile.getAbsolutePath(), versionName);
                        installApk(apkFile);
                        notifyUpdateProgress("completed", "安装界面已打开，请按系统提示继续安装。", apkFile.length(), apkFile.length(), apkFile.getAbsolutePath(), versionName);
                        call.resolve(result);
                    } catch (Exception installError) {
                        notifyErrorProgress(installError.getMessage(), versionName);
                        call.reject(installError.getMessage(), installError);
                    }
                });
            } catch (Exception error) {
                notifyErrorProgress(error.getMessage(), versionName);
                call.reject(error.getMessage(), error);
            }
        }).start();
    }

    private File downloadApk(String urlString, String versionName) throws Exception {
        HttpURLConnection connection = null;
        InputStream inputStream = null;
        FileOutputStream outputStream = null;

        File baseDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (baseDir == null) {
            throw new IllegalStateException("无法访问应用下载目录。");
        }

        File updatesDir = new File(baseDir, "updates");
        if (!updatesDir.exists() && !updatesDir.mkdirs()) {
            throw new IllegalStateException("无法创建更新目录。");
        }

        String safeVersion = versionName.replaceAll("[^a-zA-Z0-9._-]", "_");
        File apkFile = new File(updatesDir, "MoRanJiangHu-" + safeVersion + ".apk");

        try {
            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(60000);
            connection.setRequestMethod("GET");
            connection.connect();

            int responseCode = connection.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) {
                throw new IllegalStateException("下载更新失败，HTTP " + responseCode);
            }

            long totalBytes = connection.getContentLengthLong();
            long downloadedBytes = 0L;
            long lastReportedAt = 0L;

            inputStream = connection.getInputStream();
            outputStream = new FileOutputStream(apkFile, false);

            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, bytesRead);
                downloadedBytes += bytesRead;

                long now = System.currentTimeMillis();
                if (now - lastReportedAt >= 180L || (totalBytes > 0L && downloadedBytes >= totalBytes)) {
                    notifyUpdateProgress("downloading", "正在下载更新包...", downloadedBytes, totalBytes, apkFile.getAbsolutePath(), versionName);
                    lastReportedAt = now;
                }
            }
            outputStream.flush();
            notifyUpdateProgress("downloaded", "更新包下载完成。", downloadedBytes, totalBytes, apkFile.getAbsolutePath(), versionName);
            return apkFile;
        } finally {
            if (outputStream != null) {
                outputStream.close();
            }
            if (inputStream != null) {
                inputStream.close();
            }
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private void installApk(File apkFile) {
        Uri apkUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apkFile
        );

        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
        intent.setData(apkUri);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
        intent.putExtra(Intent.EXTRA_RETURN_RESULT, true);
        getContext().startActivity(intent);
    }

    private void notifyUpdateProgress(
        String stage,
        String message,
        long downloadedBytes,
        long totalBytes,
        String filePath,
        String versionName
    ) {
        JSObject payload = new JSObject();
        payload.put("stage", stage);
        payload.put("message", message);
        payload.put("downloadedBytes", downloadedBytes);
        payload.put("totalBytes", totalBytes);
        payload.put("filePath", filePath);
        payload.put("versionName", versionName);
        if (totalBytes > 0L) {
            double percent = (downloadedBytes * 100.0d) / totalBytes;
            payload.put("percent", Double.parseDouble(String.format(Locale.US, "%.2f", percent)));
        }
        notifyListeners("updateProgress", payload);
    }

    private void notifyErrorProgress(String message, String versionName) {
        JSObject payload = new JSObject();
        payload.put("stage", "error");
        payload.put("message", message != null && !message.trim().isEmpty() ? message : "更新失败");
        payload.put("versionName", versionName);
        notifyListeners("updateProgress", payload);
    }

    private String computeSha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        FileInputStream inputStream = null;

        try {
            inputStream = new FileInputStream(file);
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                digest.update(buffer, 0, bytesRead);
            }
        } finally {
            if (inputStream != null) {
                inputStream.close();
            }
        }

        byte[] hash = digest.digest();
        StringBuilder builder = new StringBuilder(hash.length * 2);
        for (byte item : hash) {
            builder.append(String.format("%02x", item));
        }
        return builder.toString();
    }
}
