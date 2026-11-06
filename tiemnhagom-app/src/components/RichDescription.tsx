import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
  TextStyle,
  LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSettings } from '../context/SettingsContext';

// Kích hoạt LayoutAnimation trên Android (chỉ cần thiết ở Old Architecture, New Architecture / Fabric đã tự động bật)
if (
  Platform.OS === 'android' &&
  !(globalThis as any).nativeFabricUIManager &&
  UIManager?.setLayoutAnimationEnabledExperimental
) {
  try {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  } catch {}
}

const COLLAPSED_HEIGHT = 200;

interface AstNode {
  type: 'tag' | 'text';
  name?: string;
  attributes?: Record<string, string>;
  children?: AstNode[];
  text?: string;
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input']);
const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'hr', 'img'
]);

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&bull;/gi, '•')
    .replace(/&hellip;/gi, '…')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseTagAttributes(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9\-_]+)(?:=(?:'([^']*)'|"([^"]*)"|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrStr)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4] !== undefined ? match[4] : '';
    attrs[key] = val;
  }
  return attrs;
}

function parseHtmlToAst(html: string): AstNode[] {
  if (!html) return [];

  // Nếu là chuỗi plain text thuần không chứa thẻ HTML, phân tách theo xuống dòng
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    const lines = html.split(/\r?\n/);
    return lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return {
          type: 'tag',
          name: 'p',
          attributes: {},
          children: [{ type: 'tag', name: 'br', children: [] }],
        };
      }
      return {
        type: 'tag',
        name: 'p',
        attributes: {},
        children: [{ type: 'text', text: line }],
      };
    });
  }

  const root: AstNode = { type: 'tag', name: 'root', children: [] };
  const stack: AstNode[] = [root];
  const tagRegex = /<(\/)?([a-zA-Z0-9]+)([^>]*)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      const text = html.slice(lastIndex, match.index);
      const isTopLevel = stack.length === 1;
      // Bỏ qua các ký tự xuống dòng thuần giữa các thẻ block ở tầng gốc
      if (!isTopLevel || text.trim().length > 0) {
        stack[stack.length - 1].children!.push({
          type: 'text',
          text: decodeHtmlEntities(text),
        });
      }
    }
    lastIndex = tagRegex.lastIndex;

    const isClosing = Boolean(match[1]);
    const tagName = match[2].toLowerCase();
    const attrStr = match[3] || '';
    const isSelfClosing = attrStr.trim().endsWith('/') || VOID_TAGS.has(tagName);

    if (isClosing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === tagName) {
          stack.splice(i);
          break;
        }
      }
    } else if (isSelfClosing) {
      stack[stack.length - 1].children!.push({
        type: 'tag',
        name: tagName,
        attributes: parseTagAttributes(attrStr),
        children: [],
      });
    } else {
      const newNode: AstNode = {
        type: 'tag',
        name: tagName,
        attributes: parseTagAttributes(attrStr),
        children: [],
      };
      stack[stack.length - 1].children!.push(newNode);
      stack.push(newNode);
    }
  }

  if (lastIndex < html.length) {
    const text = html.slice(lastIndex);
    if (text.trim().length > 0) {
      stack[stack.length - 1].children!.push({
        type: 'text',
        text: decodeHtmlEntities(text),
      });
    }
  }

  return root.children || [];
}

function groupInlineNodes(nodes: AstNode[]): AstNode[] {
  const result: AstNode[] = [];
  let currentInlineGroup: AstNode[] = [];

  const flush = () => {
    if (currentInlineGroup.length > 0) {
      result.push({
        type: 'tag',
        name: 'p',
        attributes: {},
        children: currentInlineGroup,
      });
      currentInlineGroup = [];
    }
  };

  for (const node of nodes) {
    if (node.type === 'tag' && BLOCK_TAGS.has(node.name || '')) {
      flush();
      result.push(node);
    } else {
      currentInlineGroup.push(node);
    }
  }
  flush();
  return result;
}

function splitParagraphsWithImages(blocks: AstNode[]): AstNode[] {
  const result: AstNode[] = [];
  for (const block of blocks) {
    if (block.type === 'tag' && (block.name === 'p' || block.name === 'div') && block.children) {
      const hasImage = block.children.some((c) => c.name === 'img');
      if (!hasImage) {
        result.push(block);
        continue;
      }
      let subGroup: AstNode[] = [];
      for (const child of block.children) {
        if (child.name === 'img') {
          if (subGroup.length > 0) {
            result.push({ type: 'tag', name: block.name, attributes: block.attributes, children: subGroup });
            subGroup = [];
          }
          result.push(child);
        } else {
          subGroup.push(child);
        }
      }
      if (subGroup.length > 0) {
        result.push({ type: 'tag', name: block.name, attributes: block.attributes, children: subGroup });
      }
    } else {
      result.push(block);
    }
  }
  return result;
}

function parseInlineStyle(styleStr?: string, isDark?: boolean): TextStyle {
  if (!styleStr) return {};
  const styleObj: Record<string, any> = {};
  const rules = styleStr.split(';');
  for (const rule of rules) {
    const [key, rawVal] = rule.split(':').map((s) => s?.trim());
    if (!key || !rawVal) continue;
    const lowerKey = key.toLowerCase();
    const val = rawVal.toLowerCase();

    if (lowerKey === 'font-weight') {
      if (val === 'bold' || val === '700' || val === '800' || val === '900') {
        styleObj.fontWeight = '700';
      }
    } else if (lowerKey === 'font-style' && val === 'italic') {
      styleObj.fontStyle = 'italic';
    } else if (lowerKey === 'text-decoration') {
      if (val.includes('underline')) styleObj.textDecorationLine = 'underline';
      else if (val.includes('line-through')) styleObj.textDecorationLine = 'line-through';
    } else if (lowerKey === 'color') {
      if (isDark && (val === '#000' || val === '#000000' || val === '#2b2928' || val === 'black' || val === 'rgb(0, 0, 0)')) {
        styleObj.color = '#F5F5F5';
      } else {
        styleObj.color = rawVal;
      }
    }
  }
  return styleObj as TextStyle;
}

function renderInlineNodes(
  nodes: AstNode[] | undefined,
  parentStyle: TextStyle,
  isDark: boolean,
  keyPrefix: string
): React.ReactNode {
  if (!nodes || nodes.length === 0) return null;

  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === 'text') {
      return (
        <Text key={key} style={parentStyle}>
          {node.text}
        </Text>
      );
    }

    if (node.name === 'br') {
      return '\n';
    }

    if (node.name === 'strong' || node.name === 'b') {
      const boldStyle: TextStyle = { ...parentStyle, fontWeight: '700' };
      return (
        <Text key={key} style={boldStyle}>
          {renderInlineNodes(node.children, boldStyle, isDark, `${key}-b`)}
        </Text>
      );
    }

    if (node.name === 'em' || node.name === 'i') {
      const italicStyle: TextStyle = { ...parentStyle, fontStyle: 'italic' };
      return (
        <Text key={key} style={italicStyle}>
          {renderInlineNodes(node.children, italicStyle, isDark, `${key}-i`)}
        </Text>
      );
    }

    if (node.name === 'u') {
      const underlineStyle: TextStyle = { ...parentStyle, textDecorationLine: 'underline' };
      return (
        <Text key={key} style={underlineStyle}>
          {renderInlineNodes(node.children, underlineStyle, isDark, `${key}-u`)}
        </Text>
      );
    }

    if (node.name === 's' || node.name === 'strike' || node.name === 'del') {
      const strikeStyle: TextStyle = { ...parentStyle, textDecorationLine: 'line-through' };
      return (
        <Text key={key} style={strikeStyle}>
          {renderInlineNodes(node.children, strikeStyle, isDark, `${key}-s`)}
        </Text>
      );
    }

    if (node.name === 'a') {
      const href = node.attributes?.href;
      const linkStyle: TextStyle = { ...parentStyle, color: '#9C7156', textDecorationLine: 'underline' };
      return (
        <Text
          key={key}
          style={linkStyle}
          onPress={() => {
            if (href) Linking.openURL(href).catch(() => {});
          }}
        >
          {renderInlineNodes(node.children, linkStyle, isDark, `${key}-a`)}
        </Text>
      );
    }

    if (node.name === 'span') {
      const spanStyle: TextStyle = { ...parentStyle, ...parseInlineStyle(node.attributes?.style, isDark) };
      return (
        <Text key={key} style={spanStyle}>
          {renderInlineNodes(node.children, spanStyle, isDark, `${key}-span`)}
        </Text>
      );
    }

    return (
      <Text key={key} style={parentStyle}>
        {renderInlineNodes(node.children, parentStyle, isDark, `${key}-tag`)}
      </Text>
    );
  });
}

function renderBlockNode(
  node: AstNode,
  index: number,
  isDark: boolean,
  textColor: string
): React.ReactNode {
  const key = `block-${index}`;

  if (node.name === 'img') {
    const src = node.attributes?.src;
    if (!src) return null;
    return (
      <View key={key} style={styles.imageWrap}>
        <Image source={{ uri: src }} style={styles.contentImage} contentFit="contain" />
      </View>
    );
  }

  // Dòng trống hoặc đoạn văn <p><br></p> tạo khoảng cách
  if (
    (node.name === 'p' || node.name === 'div') &&
    (!node.children ||
      node.children.length === 0 ||
      (node.children.length === 1 && (node.children[0].name === 'br' || !node.children[0].text?.trim())))
  ) {
    return <View key={key} style={styles.emptyLineSpacer} />;
  }

  // Tiêu đề các cấp h1 - h6
  if (node.name && /^h[1-6]$/.test(node.name)) {
    const headingSizes: Record<string, number> = {
      h1: 20,
      h2: 18,
      h3: 16,
      h4: 15,
      h5: 14.5,
      h6: 14,
    };
    const size = headingSizes[node.name] || 16;
    const headingStyle: TextStyle = {
      fontFamily: 'ElleGaborStd',
      fontSize: size,
      fontWeight: '700',
      color: textColor,
    };

    return (
      <View key={key} style={[styles.headingWrapper, { marginTop: node.name === 'h1' ? 12 : 8 }]}>
        <Text style={headingStyle}>
          {renderInlineNodes(node.children, headingStyle, isDark, `${key}-h`)}
        </Text>
      </View>
    );
  }

  // Danh sách có thứ tự / không thứ tự (ul / ol / li)
  if (node.name === 'ul' || node.name === 'ol') {
    const isOrdered = node.name === 'ol';
    const items = (node.children || []).filter((c) => c.name === 'li');
    return (
      <View key={key} style={styles.listContainer}>
        {items.map((li, liIndex) => {
          const itemKey = `${key}-li-${liIndex}`;
          const baseStyle: TextStyle = {
            fontFamily: 'ElleGaborStd',
            fontSize: 14,
            lineHeight: 22,
            color: textColor,
          };
          return (
            <View key={itemKey} style={styles.listItemRow}>
              <Text style={[styles.listBullet, { color: '#9C7156' }]}>
                {isOrdered ? `${liIndex + 1}. ` : '• '}
              </Text>
              <Text style={[baseStyle, { flex: 1 }]}>
                {renderInlineNodes(li.children, baseStyle, isDark, `${itemKey}-content`)}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  // Trích dẫn Blockquote
  if (node.name === 'blockquote') {
    const bqStyle: TextStyle = {
      fontFamily: 'ElleGaborStd',
      fontSize: 14,
      lineHeight: 22,
      fontStyle: 'italic',
      color: textColor,
    };
    return (
      <View
        key={key}
        style={[
          styles.blockquote,
          {
            borderLeftColor: '#9C7156',
            backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
          },
        ]}
      >
        <Text style={bqStyle}>
          {renderInlineNodes(node.children, bqStyle, isDark, `${key}-bq`)}
        </Text>
      </View>
    );
  }

  // Đoạn văn chuẩn <p> / <div>
  const paragraphStyle: TextStyle = {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    lineHeight: 22,
    color: textColor,
  };

  return (
    <View key={key} style={styles.paragraphWrapper}>
      <Text style={paragraphStyle}>
        {renderInlineNodes(node.children, paragraphStyle, isDark, `${key}-p`)}
      </Text>
    </View>
  );
}

export interface RichDescriptionProps {
  htmlContent?: string;
  isDark: boolean;
  textColor?: string;
  cardBackground?: string;
  maxCollapsedHeight?: number;
}

export function RichDescription({
  htmlContent,
  isDark,
  textColor = '#2B2928',
  cardBackground,
  maxCollapsedHeight = COLLAPSED_HEIGHT,
}: RichDescriptionProps) {
  const { t } = useSettings();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [contentHeight, setContentHeight] = useState<number>(0);

  const parsedBlocks = useMemo(() => {
    if (!htmlContent) return [];
    const rawAst = parseHtmlToAst(htmlContent);
    const grouped = groupInlineNodes(rawAst);
    return splitParagraphsWithImages(grouped);
  }, [htmlContent]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    if (height > 0) {
      setContentHeight(height);
    }
  }, []);

  const isCollapsible = contentHeight > maxCollapsedHeight + 20;

  const handleToggle = () => {
    Haptics.selectionAsync().catch(() => {});
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setIsExpanded((prev) => !prev);
  };

  if (parsedBlocks.length === 0) {
    return null;
  }

  const bgColor = cardBackground || (isDark ? '#121212' : '#FFFFFF');

  return (
    <View style={styles.outerContainer}>
      <View
        style={[
          styles.contentWrapper,
          !isExpanded && isCollapsible && { maxHeight: maxCollapsedHeight, overflow: 'hidden' },
        ]}
      >
        <View onLayout={handleLayout} style={styles.innerContent}>
          {parsedBlocks.map((block, index) =>
            renderBlockNode(block, index, isDark, textColor)
          )}
        </View>

        {!isExpanded && isCollapsible && (
          <LinearGradient
            colors={
              isDark
                ? ['rgba(18, 18, 18, 0)', 'rgba(18, 18, 18, 0.75)', bgColor]
                : ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.85)', bgColor]
            }
            locations={[0, 0.45, 1]}
            style={styles.fadeOverlay}
            pointerEvents="none"
          />
        )}
      </View>

      {isCollapsible && (
        <View style={styles.toggleWrapper}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleToggle}
            style={[
              styles.toggleBtn,
              {
                backgroundColor: isDark ? '#1E1E1E' : '#FAF8F5',
                borderColor: isDark ? 'rgba(232, 204, 178, 0.22)' : '#E8E1D8',
              },
            ]}
          >
            <Text style={[styles.toggleText, { color: '#9C7156' }]}>
              {isExpanded ? t('collapseDesc') : t('viewMoreDesc')}
            </Text>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={15}
              color="#9C7156"
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
export default RichDescription;

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
  },
  contentWrapper: {
    position: 'relative',
    width: '100%',
  },
  innerContent: {
    width: '100%',
  },
  fadeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
  },
  paragraphWrapper: {
    marginBottom: 8,
  },
  headingWrapper: {
    marginBottom: 6,
  },
  emptyLineSpacer: {
    height: 10,
  },
  listContainer: {
    marginBottom: 8,
    paddingLeft: 4,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  listBullet: {
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    lineHeight: 22,
    marginRight: 6,
    fontWeight: '700',
  },
  blockquote: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 6,
    marginVertical: 8,
    borderRadius: 4,
  },
  imageWrap: {
    marginVertical: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  contentImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
  },
  toggleWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
  },
  toggleText: {
    fontFamily: 'ElleGaborStd',
    fontSize: 13,
    fontWeight: '600',
  },
});
