// src/utils/textScaler.ts
import { Platform, Text, TextInput } from 'react-native';

let currentFontScale = 1.0;
let forceSansSerif = true; // Bật chế độ font Sans-serif toàn bộ ứng dụng (SF Pro trên iOS, Roboto trên Android)

export const SYSTEM_SANS_SERIF = Platform.select({
  ios: undefined, // Trên iOS, không đặt fontFamily sẽ tự động dùng San Francisco (SF Pro) chuẩn Apple
  android: 'sans-serif', // Trên Android, 'sans-serif' là Roboto chuẩn của Android
  default: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

export function setForceSansSerif(enabled: boolean) {
  forceSansSerif = enabled;
}

export function isForceSansSerif(): boolean {
  return forceSansSerif;
}

export function getGlobalFontScale(): number {
  return currentFontScale;
}

export function scaleStyle(style: any, scale: number): any {
  if (!style) {
    if (scale !== 1.0) {
      const fallback: any = { fontSize: Math.round(14 * scale) };
      if (forceSansSerif && SYSTEM_SANS_SERIF) fallback.fontFamily = SYSTEM_SANS_SERIF;
      return fallback;
    }
    if (forceSansSerif && SYSTEM_SANS_SERIF) {
      return { fontFamily: SYSTEM_SANS_SERIF };
    }
    return style;
  }

  if (Array.isArray(style)) {
    return style.map((s) => scaleStyle(s, scale));
  }

  if (typeof style === 'object') {
    let res: any = { ...style };

    // Không can thiệp nếu là icon font (Ionicons, MaterialIcons, Feather, v.v.)
    if (
      res.fontFamily &&
      res.fontFamily !== 'ElleGaborStd' &&
      res.fontFamily !== 'ElleGaborStd-Light' &&
      res.fontFamily !== 'serif' &&
      res.fontFamily !== 'System' &&
      res.fontFamily !== 'sans-serif'
    ) {
      return style;
    }

    // 1. Chuyển đổi font có chân (ElleGaborStd) sang font Sans-Serif hệ thống (SF Pro / Roboto)
    if (forceSansSerif) {
      if (
        res.fontFamily === 'ElleGaborStd' ||
        res.fontFamily === 'ElleGaborStd-Light' ||
        res.fontFamily === 'serif'
      ) {
        if (SYSTEM_SANS_SERIF) {
          res.fontFamily = SYSTEM_SANS_SERIF;
        } else {
          delete res.fontFamily;
        }
      }
    }

    // 2. Scale kích thước font & line height
    if (typeof res.fontSize === 'number') {
      const newFontSize = Math.round(res.fontSize * scale);
      res.fontSize = newFontSize;
      if (typeof res.lineHeight === 'number') {
        res.lineHeight = Math.round(res.lineHeight * scale);
      }
      
      // Nếu là font sans-serif chuẩn, chữ đã rất nét và dày dặn tự nhiên, không cần thêm textShadow stroke
      if (!forceSansSerif && !res.textShadowColor) {
        const textColor = res.color || 'rgba(0,0,0,0.8)';
        res.textShadowColor = textColor;
        res.textShadowOffset = { width: 0.15, height: 0.15 };
        res.textShadowRadius = 0.8;
      }
    }

    return res;
  }

  return style;
}

function isTextComponent(type: any): boolean {
  if (!type) return false;
  if (type === Text || type === TextInput) return true;
  if (typeof type === 'object') {
    if (type.displayName === 'Text' || type.displayName === 'TextInput') return true;
    if (type.name === 'Text' || type.name === 'TextImpl' || type.name === 'TextInput') return true;
  }
  if (typeof type === 'function') {
    if (type.displayName === 'Text' || type.displayName === 'TextInput') return true;
    if (type.name === 'Text' || type.name === 'TextImpl' || type.name === 'TextInput') return true;
  }
  return false;
}

export function setGlobalFontScale(scale: number) {
  currentFontScale = scale;

  // Hỗ trợ web root CSS nếu chạy trên Web
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.style.setProperty('--app-font-scale', `${scale}`);
    const root = document.getElementById('root') || document.body;
    if (root) {
      (root.style as any).fontSize = `${Math.round(15 * scale)}px`;
      if (forceSansSerif) {
        (root.style as any).fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      }
    }
  }
}

/**
 * Khởi tạo Global Text Scaler để tự động áp dụng cỡ chữ và font Sans-serif toàn bộ ứng dụng
 */
export function initTextScaler(initialScale: number = 1.0) {
  currentFontScale = initialScale;

  // 1. TẦNG JSX RUNTIME (Bắt tất cả <Text> và <TextInput> trong React 19)
  try {
    // Development Runtime
    // @ts-ignore
    const JsxDev = typeof require !== 'undefined' ? require('react/jsx-dev-runtime') : null;
    if (JsxDev && typeof JsxDev.jsxDEV === 'function' && !JsxDev.__isScaled) {
      const origJsxDev = JsxDev.jsxDEV;
      JsxDev.jsxDEV = function (type: any, props: any, key: any, isStatic: any, source: any, self: any) {
        if (isTextComponent(type) && props) {
          const scaledStyle = scaleStyle(props.style, currentFontScale);
          return origJsxDev.call(this, type, { ...props, style: scaledStyle }, key, isStatic, source, self);
        }
        return origJsxDev.call(this, type, props, key, isStatic, source, self);
      };
      JsxDev.__isScaled = true;
    }
  } catch {}

  try {
    // Production Runtime
    // @ts-ignore
    const JsxProd = typeof require !== 'undefined' ? require('react/jsx-runtime') : null;
    if (JsxProd && typeof JsxProd.jsx === 'function' && !JsxProd.__isScaled) {
      const origJsx = JsxProd.jsx;
      const origJsxs = JsxProd.jsxs;

      JsxProd.jsx = function (type: any, props: any, key: any) {
        if (isTextComponent(type) && props) {
          const scaledStyle = scaleStyle(props.style, currentFontScale);
          return origJsx.call(this, type, { ...props, style: scaledStyle }, key);
        }
        return origJsx.call(this, type, props, key);
      };

      if (typeof origJsxs === 'function') {
        JsxProd.jsxs = function (type: any, props: any, key: any) {
          if (isTextComponent(type) && props) {
            const scaledStyle = scaleStyle(props.style, currentFontScale);
            return origJsxs.call(this, type, { ...props, style: scaledStyle }, key);
          }
          return origJsxs.call(this, type, props, key);
        };
      }

      JsxProd.__isScaled = true;
    }
  } catch {}

  // 2. TẦNG REACT NATIVE TEXT
  try {
    const TextComponent = Text as any;
    if (TextComponent && typeof TextComponent.render === 'function' && !TextComponent.__isScaled) {
      const originalTextRender = TextComponent.render;
      TextComponent.render = function (props: any, ref: any) {
        const scaledStyle = scaleStyle(props?.style, currentFontScale);
        return originalTextRender.call(this, { ...props, style: scaledStyle }, ref);
      };
      TextComponent.__isScaled = true;
    }
  } catch (err) {
    console.warn('Lỗi hook Text.render:', err);
  }

  // 3. TẦNG REACT NATIVE TEXTINPUT
  try {
    const TextInputComponent = TextInput as any;
    if (
      TextInputComponent &&
      typeof TextInputComponent.render === 'function' &&
      !TextInputComponent.__isScaled
    ) {
      const originalInputRender = TextInputComponent.render;
      TextInputComponent.render = function (props: any, ref: any) {
        const scaledStyle = scaleStyle(props?.style, currentFontScale);
        return originalInputRender.call(this, { ...props, style: scaledStyle }, ref);
      };
      TextInputComponent.__isScaled = true;
    }
  } catch (err) {
    console.warn('Lỗi hook TextInput.render:', err);
  }

  // 4. TẦNG REACT NATIVE WEB
  try {
    // @ts-ignore
    const RNW = typeof require !== 'undefined' ? require('react-native-web') : null;
    if (RNW?.Text && typeof RNW.Text.render === 'function' && !RNW.Text.__isScaled) {
      const origWebRender = RNW.Text.render;
      RNW.Text.render = function (props: any, ref: any) {
        const scaledStyle = scaleStyle(props?.style, currentFontScale);
        return origWebRender.call(this, { ...props, style: scaledStyle }, ref);
      };
      RNW.Text.__isScaled = true;
    }
  } catch {}
}

// Tự động gọi initTextScaler ngay khi module được import
initTextScaler(1.0);
