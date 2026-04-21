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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
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
            call.reject("请先在系统中允许本应用安装未知来源应用，然后再重试更新。");
            return;
        }

        new Thread(() -> {
            try {
                File apkFile = downloadApk(url, versionName);

                JSObject result = new JSObject();
                result.put("filePath", apkFile.getAbsolutePath());
                result.put("versionName", versionName);

                if (getActivity() == null) {
                    call.reject("当前没有可用的 Activity。");
                    return;
                }

                getActivity().runOnUiThread(() -> {
                    try {
                        installApk(apkFile);
                        call.resolve(result);
                    } catch (Exception installError) {
                        call.reject(installError.getMessage(), installError);
                    }
                });
            } catch (Exception error) {
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

            inputStream = connection.getInputStream();
            outputStream = new FileOutputStream(apkFile, false);

            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, bytesRead);
            }
            outputStream.flush();
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

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}
