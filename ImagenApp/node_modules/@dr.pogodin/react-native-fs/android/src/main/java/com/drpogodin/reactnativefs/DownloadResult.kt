package com.drpogodin.reactnativefs

class DownloadResult {
    @JvmField
    var statusCode = 0
    @JvmField
    var bytesWritten: Long = 0
    @JvmField
    var exception: Exception? = null
}
