// src/components/FirebasePhoneAuthWebView.tsx
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Text, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { firebaseConfig } from '../config/firebase';

export interface FirebasePhoneAuthWebViewHandle {
  sendOtp: (phoneNumber: string) => Promise<{ success: boolean; error?: string }>;
  verifyOtp: (code: string) => Promise<{ success: boolean; uid?: string; phoneNumber?: string; error?: string }>;
}

interface Props {
  onChallengeStateChange?: (active: boolean) => void;
}

export const FirebasePhoneAuthWebView = forwardRef<FirebasePhoneAuthWebViewHandle, Props>(
  ({ onChallengeStateChange }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const [challengeVisible, setChallengeVisible] = useState(false);

    // Resolvers for asynchronous send & verify
    const sendOtpPromiseRef = useRef<{
      resolve: (val: { success: boolean; error?: string }) => void;
      timer: any;
    } | null>(null);

    const verifyOtpPromiseRef = useRef<{
      resolve: (val: { success: boolean; uid?: string; phoneNumber?: string; error?: string }) => void;
      timer: any;
    } | null>(null);

    useImperativeHandle(ref, () => ({
      sendOtp: (phoneNumber: string) => {
        return new Promise((resolve) => {
          if (sendOtpPromiseRef.current) {
            clearTimeout(sendOtpPromiseRef.current.timer);
          }

          const timer = setTimeout(() => {
            if (sendOtpPromiseRef.current) {
              sendOtpPromiseRef.current.resolve({
                success: false,
                error: 'Yêu cầu gửi mã OTP quá thời gian chờ (Timeout). Vui lòng thử lại.',
              });
              sendOtpPromiseRef.current = null;
            }
          }, 35000);

          sendOtpPromiseRef.current = { resolve, timer };

          // Format phone with +84 for Firebase
          let authPhone = phoneNumber.trim();
          if (authPhone.startsWith('0')) {
            authPhone = '+84' + authPhone.slice(1);
          } else if (!authPhone.startsWith('+')) {
            authPhone = '+84' + authPhone;
          }

          const jsCode = `if (typeof window.sendOtp === 'function') { window.sendOtp('${authPhone}'); } else { console.warn('sendOtp not ready'); } true;`;
          webViewRef.current?.injectJavaScript(jsCode);
        });
      },

      verifyOtp: (code: string) => {
        return new Promise((resolve) => {
          if (verifyOtpPromiseRef.current) {
            clearTimeout(verifyOtpPromiseRef.current.timer);
          }

          const timer = setTimeout(() => {
            if (verifyOtpPromiseRef.current) {
              verifyOtpPromiseRef.current.resolve({
                success: false,
                error: 'Xác thực mã OTP quá thời gian chờ (Timeout). Vui lòng thử lại.',
              });
              verifyOtpPromiseRef.current = null;
            }
          }, 30000);

          verifyOtpPromiseRef.current = { resolve, timer };

          const jsCode = `if (typeof window.verifyOtp === 'function') { window.verifyOtp('${code.trim()}'); } else { console.warn('verifyOtp not ready'); } true;`;
          webViewRef.current?.injectJavaScript(jsCode);
        });
      },
    }));

    const handleMessage = (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'CHALLENGE_STATE') {
          const isVis = Boolean(data.visible);
          setChallengeVisible(isVis);
          onChallengeStateChange?.(isVis);
        } else if (data.type === 'OTP_SENT') {
          if (sendOtpPromiseRef.current) {
            clearTimeout(sendOtpPromiseRef.current.timer);
            sendOtpPromiseRef.current.resolve({ success: true });
            sendOtpPromiseRef.current = null;
          }
        } else if (data.type === 'OTP_ERROR') {
          if (sendOtpPromiseRef.current) {
            clearTimeout(sendOtpPromiseRef.current.timer);
            sendOtpPromiseRef.current.resolve({
              success: false,
              error: data.error || 'Không thể gửi mã OTP. Vui lòng kiểm tra lại số điện thoại.',
            });
            sendOtpPromiseRef.current = null;
          }
        } else if (data.type === 'VERIFY_SUCCESS') {
          if (verifyOtpPromiseRef.current) {
            clearTimeout(verifyOtpPromiseRef.current.timer);
            verifyOtpPromiseRef.current.resolve({
              success: true,
              uid: data.uid,
              phoneNumber: data.phoneNumber,
            });
            verifyOtpPromiseRef.current = null;
          }
        } else if (data.type === 'VERIFY_ERROR') {
          if (verifyOtpPromiseRef.current) {
            clearTimeout(verifyOtpPromiseRef.current.timer);
            verifyOtpPromiseRef.current.resolve({
              success: false,
              error: data.error || 'Mã OTP không chính xác hoặc đã hết hạn.',
            });
            verifyOtpPromiseRef.current = null;
          }
        }
      } catch (e) {
        // ignore parse error
      }
    };

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    #recaptcha-container {
      display: flex;
      justify-content: center;
      align-items: center;
    }
  </style>
</head>
<body>
  <div id="recaptcha-container"></div>
  <script>
    var firebaseConfig = ${JSON.stringify(firebaseConfig)};
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    var recaptchaVerifier = null;
    var confirmationResult = null;

    function post(data) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      }
    }

    function initRecaptcha() {
      try {
        if (recaptchaVerifier) {
          try { recaptchaVerifier.clear(); } catch(e) {}
          recaptchaVerifier = null;
        }
        var container = document.getElementById('recaptcha-container');
        if (container) container.innerHTML = '';

        recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
          size: 'invisible',
          callback: function() {
            post({ type: 'RECAPTCHA_SOLVED' });
          },
          'expired-callback': function() {
            post({ type: 'RECAPTCHA_EXPIRED' });
          }
        });
        recaptchaVerifier.render().then(function() {
          post({ type: 'READY' });
        }).catch(function(err) {
          post({ type: 'READY' });
        });
      } catch (err) {
        post({ type: 'INIT_ERROR', error: err.message });
      }
    }

    // Monitor for visible reCAPTCHA challenge modal
    var observer = new MutationObserver(function() {
      var iframes = document.querySelectorAll('iframe');
      var isChallengeVisible = false;
      for (var i = 0; i < iframes.length; i++) {
        var frame = iframes[i];
        if (frame.src && (frame.src.indexOf('bframe') !== -1 || frame.src.indexOf('recaptcha') !== -1)) {
          var rect = frame.getBoundingClientRect();
          if (rect.width > 120 && rect.height > 120) {
            isChallengeVisible = true;
            break;
          }
        }
      }
      post({ type: 'CHALLENGE_STATE', visible: isChallengeVisible });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    window.onload = function() {
      initRecaptcha();
    };

    window.sendOtp = function(phoneNumber) {
      if (!recaptchaVerifier) {
        initRecaptcha();
      }
      firebase.auth().signInWithPhoneNumber(phoneNumber, recaptchaVerifier)
        .then(function(result) {
          confirmationResult = result;
          post({ type: 'OTP_SENT' });
        })
        .catch(function(error) {
          post({ type: 'OTP_ERROR', error: error.message, code: error.code });
          initRecaptcha();
        });
    };

    window.verifyOtp = function(code) {
      if (!confirmationResult) {
        post({ type: 'VERIFY_ERROR', error: 'Chưa có thông tin xác thực OTP. Vui lòng bấm gửi lại mã.' });
        return;
      }
      confirmationResult.confirm(code)
        .then(function(result) {
          var user = result.user;
          post({
            type: 'VERIFY_SUCCESS',
            uid: user.uid,
            phoneNumber: user.phoneNumber
          });
        })
        .catch(function(error) {
          post({ type: 'VERIFY_ERROR', error: error.message, code: error.code });
        });
    };
  </script>
</body>
</html>
    `;

    return (
      <>
        {/* Invisible WebView when idle */}
        <View
          pointerEvents={challengeVisible ? 'auto' : 'none'}
          style={challengeVisible ? styles.visibleContainer : styles.hiddenContainer}
        >
          {challengeVisible && (
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderText}>Xác minh bảo mật (reCAPTCHA)</Text>
              <TouchableOpacity onPress={() => setChallengeVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color="#111" />
              </TouchableOpacity>
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ html: htmlContent, baseUrl: 'https://tiemnhagom-project.firebaseapp.com' }}
            onMessage={handleMessage}
            style={challengeVisible ? styles.webViewChallenge : styles.webViewHidden}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            originWhitelist={['*']}
            mixedContentMode="always"
            allowsInlineMediaPlayback={true}
            scalesPageToFit={false}
          />
        </View>
      </>
    );
  }
);

const styles = StyleSheet.create({
  hiddenContainer: {
    width: 1,
    height: 1,
    position: 'absolute',
    opacity: 0,
    top: -500,
    left: -500,
  },
  webViewHidden: {
    width: 1,
    height: 1,
    backgroundColor: 'transparent',
  },
  visibleContainer: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    bottom: 50,
    zIndex: 9999,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  modalHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2B2928',
  },
  webViewChallenge: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
