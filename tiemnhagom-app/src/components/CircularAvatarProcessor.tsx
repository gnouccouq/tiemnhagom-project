import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';

export function getAvatarHash(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) + hash + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

interface CircularAvatarProcessorProps {
  avatarUrl: string | null;
  onProcessed: (cachedUri: string) => void;
}

const HTML_CONTENT = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>body { margin: 0; padding: 0; background: transparent; }</style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    window.runCrop = function(b64) {
      try {
        var img = new Image();
        img.onload = function() {
          var size = 128;
          var canvas = document.getElementById('c');
          canvas.width = size;
          canvas.height = size;
          var ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, size, size);

          // Cắt hình tròn anti-aliased
          ctx.save();
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();

          // Aspect fill (center crop)
          var nw = img.naturalWidth || img.width;
          var nh = img.naturalHeight || img.height;
          var minSide = Math.min(nw, nh);
          var sx = (nw - minSide) / 2;
          var sy = (nh - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          ctx.restore();

          // Viền men gốm be ấm #E8CCB2 sắc nét chuẩn Brand Guidelines
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, (size / 2) - 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = '#E8CCB2';
          ctx.lineWidth = 3;
          ctx.stroke();

          var pngData = canvas.toDataURL('image/png');
          window.ReactNativeWebView.postMessage(pngData);
        };
        img.onerror = function() {
          window.ReactNativeWebView.postMessage('ERROR');
        };
        if (b64.indexOf('data:') === 0) {
          img.src = b64;
        } else {
          var mime = 'image/jpeg';
          if (b64.charAt(0) === 'i') mime = 'image/png';
          else if (b64.charAt(0) === 'U') mime = 'image/webp';
          else if (b64.charAt(0) === 'R') mime = 'image/gif';
          img.src = 'data:' + mime + ';base64,' + b64;
        }
      } catch (e) {
        window.ReactNativeWebView.postMessage('ERROR: ' + String(e));
      }
    };
  </script>
</body>
</html>
`;

export function CircularAvatarProcessor({ avatarUrl, onProcessed }: CircularAvatarProcessorProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [base64Raw, setBase64Raw] = useState<string | null>(null);
  const webViewRef = useRef<any>(null);

  useEffect(() => {
    if (!avatarUrl) {
      setIsProcessing(false);
      setBase64Raw(null);
      return;
    }

    let isMounted = true;
    const hash = getAvatarHash(avatarUrl);
    const target = `${FileSystem.cacheDirectory}avatar_circle_${hash}.png`;

    FileSystem.getInfoAsync(target)
      .then((info) => {
        if (!isMounted) return;
        if (info.exists) {
          onProcessed(target);
          setIsProcessing(false);
        } else {
          startProcessing(avatarUrl, hash);
        }
      })
      .catch(() => {
        if (isMounted) {
          startProcessing(avatarUrl, hash);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [avatarUrl]);

  const startProcessing = async (url: string, hash: string) => {
    try {
      setIsProcessing(true);
      let rawBase64 = '';

      if (url.startsWith('data:image')) {
        rawBase64 = url.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '');
      } else if (url.startsWith('file://')) {
        rawBase64 = await FileSystem.readAsStringAsync(url, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        // Tải ảnh về bộ nhớ đệm tạm thời thông qua Native HTTP stack (không bị CORS)
        const tempDownload = `${FileSystem.cacheDirectory}temp_raw_avatar_${hash}`;
        const downloadRes = await FileSystem.downloadAsync(url, tempDownload);
        if (downloadRes.status >= 200 && downloadRes.status < 300) {
          rawBase64 = await FileSystem.readAsStringAsync(tempDownload, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await FileSystem.deleteAsync(tempDownload, { idempotent: true }).catch(() => {});
        } else {
          throw new Error('Download failed with status ' + downloadRes.status);
        }
      }

      if (rawBase64) {
        setBase64Raw(rawBase64);
      } else {
        setIsProcessing(false);
      }
    } catch (err) {
      setIsProcessing(false);
    }
  };

  const handleLoadEnd = () => {
    if (base64Raw && webViewRef.current) {
      const js = `if (window.runCrop) { window.runCrop(${JSON.stringify(base64Raw)}); } true;`;
      webViewRef.current.injectJavaScript(js);
    }
  };

  useEffect(() => {
    if (base64Raw && webViewRef.current) {
      const js = `if (window.runCrop) { window.runCrop(${JSON.stringify(base64Raw)}); } true;`;
      const timer = setTimeout(() => {
        try {
          webViewRef.current?.injectJavaScript(js);
        } catch (_) {}
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [base64Raw]);

  const handleMessage = async (event: any) => {
    const data = event?.nativeEvent?.data;
    if (typeof data === 'string' && data.startsWith('data:image/png;base64,')) {
      const cleanBase64 = data.replace('data:image/png;base64,', '');
      const hash = getAvatarHash(avatarUrl || '');
      const target = `${FileSystem.cacheDirectory}avatar_circle_${hash}.png`;
      try {
        await FileSystem.writeAsStringAsync(target, cleanBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        onProcessed(target);
      } catch (writeErr) {
        // write error
      } finally {
        setIsProcessing(false);
        setBase64Raw(null);
      }
    } else {
      setIsProcessing(false);
      setBase64Raw(null);
    }
  };

  if (!isProcessing || !base64Raw) {
    return null;
  }

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ html: HTML_CONTENT }}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        style={styles.hidden}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    width: 128,
    height: 128,
    opacity: 0.01,
    position: 'absolute',
    left: -2000,
    top: -2000,
  },
});

