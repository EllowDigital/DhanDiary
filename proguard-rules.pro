# Recommended ProGuard / R8 rules for DhanDiary
# Keep React Native entry points and Sentry mapping classes used at runtime.
# Note: Customize further if you use reflection-heavy libs.

# Keep RN classes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.soloader.** { *; }

# Keep lifecycle and annotated entry points
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Sentry SDK classes (avoid stripping important crash-reporting helpers)
-keep class io.sentry.** { *; }
-keep class io.sentry.android.** { *; }

# If you use JNI / native libraries, keep relevant native loader helpers
-keep class com.facebook.soloader.SoLoader { *; }

# Remove unused logging
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Keep parcelable creators
-keepclassmembers class * implements android.os.Parcelable {
  public static final android.os.Parcelable$Creator CREATOR;
}

# Keep and ignore warnings for Coil (image loading) and related network fetchers
# Some Coil artifact classes are referenced dynamically; keep them to avoid R8 stripping.
-keep class coil3.** { *; }
-dontwarn coil3.**

# Keep OkHttp/Network fetchers referenced by Coil
-keep class coil3.network.** { *; }
-keep class okhttp3.** { *; }

# Some libraries reference javax.lang.model.* (annotation processors) which is not
# available on Android. Suppress warnings rather than fail the build.
-dontwarn javax.lang.model.**

# Google errorprone annotation references can cause missing-class R8 failures in
# some build environments — keep and suppress warnings for the annotations.
-dontwarn com.google.errorprone.annotations.**
-keep class com.google.errorprone.annotations.** { *; }

# Keep runtime annotations so reflection/annotation-based lookups still work
-keepattributes *Annotation*
