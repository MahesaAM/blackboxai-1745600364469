package com.drpogodin.reactnativefs

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.NativeModule
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.module.model.ReactModuleInfo
import java.util.HashMap

class ReactNativeFsPackage : TurboReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == ReactNativeFsModule.NAME) {
            ReactNativeFsModule(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
        return ReactModuleInfoProvider {
            val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
            val isTurboModule: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            moduleInfos[ReactNativeFsModule.NAME] = ReactModuleInfo(
                    ReactNativeFsModule.NAME,
                    ReactNativeFsModule.NAME,
                    false,  // canOverrideExistingModule
                    false,  // needsEagerInit
                    true,  // hasConstants
                    false,  // isCxxModule
                    isTurboModule // isTurboModule
            )
            moduleInfos
        }
    }
}
