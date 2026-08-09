#!/usr/bin/env bash
# 手动构建 Android APK（无需 Gradle，纯命令行）
set -euxo pipefail

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
PLATFORM="$SDK/platforms/android-34/android.jar"
BT="$SDK/build-tools/34.0.0"
AAPT2="$BT/aapt2"

cd "$(dirname "$0")/.."
rm -rf android/build
mkdir -p android/build/classes

# 1. 同步计算器页面到 assets
mkdir -p android/assets
cp calculator.html android/assets/index.html

cd android

# 2. 编译资源
"$AAPT2" compile --dir res -o build/res.zip

# 3. 链接资源 + 清单，生成基础 APK（不含 dex）
"$AAPT2" link -o build/base.apk \
  -I "$PLATFORM" \
  --manifest AndroidManifest.xml \
  -R build/res.zip \
  -A assets \
  --auto-add-overlay \
  --min-sdk-version 21 \
  --target-sdk-version 34 \
  --version-code 1 \
  --version-name 1.0

# 4. 编译 Java 源码
javac -source 1.8 -target 1.8 -bootclasspath "$PLATFORM" -d build/classes \
  $(find src -name "*.java")

# 5. 转换为 dex
"$BT/d8" --release --lib "$PLATFORM" --min-api 21 --output build/ \
  $(find build/classes -name "*.class")

# 6. 将 classes.dex 打入 APK
(cd build && zip -q base.apk classes.dex)

# 7. zipalign 对齐
"$BT/zipalign" -f 4 build/base.apk build/aligned.apk

# 8. 生成调试密钥并签名
if [ ! -f build/debug.keystore ]; then
  keytool -genkeypair -v -keystore build/debug.keystore -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US"
fi
"$BT/apksigner" sign --ks build/debug.keystore --ks-pass pass:android \
  --key-pass pass:android --out build/calculator.apk build/aligned.apk

# 9. 输出到仓库根目录
cp build/calculator.apk ../calculator.apk
echo "BUILD OK: $(ls -lh ../calculator.apk | awk '{print $5}')"
