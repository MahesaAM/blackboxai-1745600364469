package com.drpogodin.reactnativefs

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReadableMap

abstract class ReactNativeFsSpec(context: ReactApplicationContext?) : ReactContextBaseJavaModule(context) {
  abstract fun getTypedExportedConstants(): Map<String, Any?>

  override fun getConstants(): Map<String, Any?> {
    return getTypedExportedConstants()
  }

  abstract fun addListener(eventName: String?)

  abstract fun appendFile(filepath: String, base64Content: String?, promise: Promise)

  abstract fun copyAssetsFileIOS(
    imageUri: String?,
    destPath: String?,
    width: Double,
    height: Double,
    scale: Double,
    compression: Double,
    resizeMode: String?,
    promise: Promise?
  )

  abstract fun copyAssetsVideoIOS(imageUri: String?, destPath: String?, promise: Promise?)

  abstract fun completeHandlerIOS(jobId: Double)

  abstract fun copyFile(filepath: String?, destPath: String?, options: ReadableMap?, promise: Promise)

  abstract fun copyFileAssets(assetPath: String, destination: String, promise: Promise)

  abstract fun copyFileRes(filename: String, destination: String, promise: Promise)

  abstract fun copyFolder(from: String?, to: String?, promise: Promise?)

  abstract fun downloadFile(options: ReadableMap, promise: Promise)

  abstract fun exists(filepath: String?, promise: Promise)

  abstract fun existsAssets(filepath: String?, promise: Promise)

  abstract fun existsRes(filename: String, promise: Promise)

  abstract fun getAllExternalFilesDirs(promise: Promise)

  abstract fun getFSInfo(promise: Promise)

  abstract fun hash(filepath: String?, algorithm: String, promise: Promise)

  abstract fun isResumable(jobId: Double, promise: Promise?)

  abstract fun mkdir(filepath: String?, options: ReadableMap?, promise: Promise)

  abstract fun moveFile(filepath: String?, destPath: String?, options: ReadableMap?, promise: Promise)

  abstract fun pathForBundle(bundle: String?, promise: Promise?)

  abstract fun pathForGroup(group: String?, promise: Promise?)

  abstract fun pickFile(options: ReadableMap, promise: Promise)

  abstract fun read(
    filepath: String,
    length: Double,
    position: Double,
    promise: Promise
  )

  abstract fun readDir(directory: String?, promise: Promise)

  abstract fun readDirAssets(directory: String, promise: Promise)

  abstract fun readFile(filepath: String, promise: Promise)

  abstract fun readFileAssets(filepath: String?, promise: Promise)

  abstract fun readFileRes(filename: String, promise: Promise)

  abstract fun removeListeners(count: Double)

  abstract fun resumeDownload(jobId: Double)

  abstract fun scanFile(path: String, promise: Promise)

  abstract fun setReadable(
    filepath: String?,
    readable: Boolean,
    ownerOnly: Boolean,
    promise: Promise
  )

  abstract fun stat(filepath: String, promise: Promise)

  abstract fun stopDownload(jobId: Double)

  abstract fun stopUpload(jobId: Double)

  abstract fun touch(filepath: String?, options: ReadableMap, promise: Promise)

  abstract fun unlink(filepath: String?, promise: Promise)

  abstract fun uploadFiles(options: ReadableMap, promise: Promise)

  abstract fun write(
    filepath: String,
    base64Content: String?,
    position: Double,
    promise: Promise
  )

  abstract fun writeFile(filepath: String, base64Content: String?, options: ReadableMap?, promise: Promise)
}
