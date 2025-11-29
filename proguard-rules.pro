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
