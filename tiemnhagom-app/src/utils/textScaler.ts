// src/utils/textScaler.ts
import { Text, TextInput } from 'react-native';

let currentFontScale = 1.0;

export function getGlobalFontScale(): number {
  return currentFontScale;
}

export function scaleStyle(style: any, scale: number): any {
  if (!style) {
    if (scale !== 1.0) {
      return { fontSize: Math.round(14 * scale) };
    }
    return style;
  }

  if (Array.isArray(style)) {
    return style.map((s) => scaleStyle(s, scale));
  }

  if (typeof style === 'object') {
    if (typeof style.fontSize === 'number') {
      // Đảm bảo cỡ chữ nội dung tối thiểu là 13px để dễ đọc, nhưng giữ nguyên tỷ lệ nhãn nhỏ chuyên dụng như bottom bar (<= 10.5px)
      const baseSize = style.fontSize <= 10.5 ? style.fontSize : (style.fontSize < 12 ? 13 : style.fontSize);
      const newFontSize = Math.round(baseSize * scale);
      const res: any = { ...style, fontSize: newFontSize };
      if (typeof style.lineHeight === 'number') {
        res.lineHeight = Math.max(newFontSize + 4, Math.round(style.lineHeight * scale));
      }
      // Fake text stroke to make font appear slightly thicker (user requested)
      if (!res.textShadowColor) {
        // Sử dụng chính màu chữ hiện tại để làm bóng nét (nếu không có thì dùng đen nhạt)
        const textColor = res.color || 'rgba(0,0,0,0.8)';
        res.textShadowColor = textColor;
        res.textShadowOffset = { width: 0.15, height: 0.15 };
        res.textShadowRadius = 0.8;
      }
      
      return res;
    }
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
    }
  }
}

/**
 * Khởi tạo Global Text Scaler để tự động áp dụng cỡ chữ toàn bộ ứng dụng
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
        if (isTextComponent(type) && props && props.style) {
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
        if (isTextComponent(type) && props && props.style) {
          const scaledStyle = scaleStyle(props.style, currentFontScale);
          return origJsx.call(this, type, { ...props, style: scaledStyle }, key);
        }
        return origJsx.call(this, type, props, key);
      };

      if (typeof origJsxs === 'function') {
        JsxProd.jsxs = function (type: any, props: any, key: any) {
          if (isTextComponent(type) && props && props.style) {
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
