import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../src/context/SettingsContext';

export default function SetupPreferencesScreen() {
  const router = useRouter();
  const { t, language, setLanguage, fontSize, setFontSize } = useSettings();

  const handleNext = () => {
    router.replace('/setup-permissions');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F5" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('chooseLanguageTitle')}</Text>
          <Text style={styles.subtitle}>{t('chooseLanguageSubtitle')}</Text>
        </View>
        
        <View style={styles.optionsList}>
          <TouchableOpacity 
            style={[styles.settingOptionCard, language === 'vi' && styles.settingOptionCardActive]} 
            activeOpacity={0.8}
            onPress={() => setLanguage('vi')}
          >
            <View style={styles.settingOptionLeft}>
              <Image source={{ uri: 'https://flagcdn.com/w80/vn.png' }} style={styles.langFlagImage} />
              <View>
                <Text style={[styles.settingOptionName, language === 'vi' && styles.settingOptionNameActive]}>Tiếng Việt</Text>
              </View>
            </View>
            <View style={[styles.radioCircle, language === 'vi' && styles.radioCircleActive]}>
              {language === 'vi' && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.settingOptionCard, language === 'en' && styles.settingOptionCardActive]} 
            activeOpacity={0.8}
            onPress={() => setLanguage('en')}
          >
            <View style={styles.settingOptionLeft}>
              <Image source={{ uri: 'https://flagcdn.com/w80/gb.png' }} style={styles.langFlagImage} />
              <View>
                <Text style={[styles.settingOptionName, language === 'en' && styles.settingOptionNameActive]}>English</Text>
              </View>
            </View>
            <View style={[styles.radioCircle, language === 'en' && styles.radioCircleActive]}>
              {language === 'en' && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.settingOptionCard, language === 'zh' && styles.settingOptionCardActive]} 
            activeOpacity={0.8}
            onPress={() => setLanguage('zh')}
          >
            <View style={styles.settingOptionLeft}>
              <Image source={{ uri: 'https://flagcdn.com/w80/cn.png' }} style={styles.langFlagImage} />
              <View>
                <Text style={[styles.settingOptionName, language === 'zh' && styles.settingOptionNameActive]}>中文 (Chinese)</Text>
              </View>
            </View>
            <View style={[styles.radioCircle, language === 'zh' && styles.radioCircleActive]}>
              {language === 'zh' && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        </View>

        <Text style={[styles.title, { marginTop: 40 }]}>{t('chooseFontSizeTitle')}</Text>
        <View style={styles.fontSizeGrid}>
          <TouchableOpacity 
            style={[styles.fontSizeChip, fontSize === 'small' && styles.fontSizeChipActive]} 
            activeOpacity={0.8}
            onPress={() => setFontSize('small')}
          >
            <Text style={[styles.fontSizeChipLabel, fontSize === 'small' && styles.fontSizeChipLabelActive, { fontSize: 11 }]}>Aa</Text>
            <Text style={[styles.fontSizeChipSub, fontSize === 'small' && styles.fontSizeChipSubActive]}>
              {t('small')}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.fontSizeChip, fontSize === 'normal' && styles.fontSizeChipActive]} 
            activeOpacity={0.8}
            onPress={() => setFontSize('normal')}
          >
            <Text style={[styles.fontSizeChipLabel, fontSize === 'normal' && styles.fontSizeChipLabelActive, { fontSize: 13 }]}>Aa</Text>
            <Text style={[styles.fontSizeChipSub, fontSize === 'normal' && styles.fontSizeChipSubActive]}>
              {t('medium')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.fontSizeChip, fontSize === 'large' && styles.fontSizeChipActive]} 
            activeOpacity={0.8}
            onPress={() => setFontSize('large')}
          >
            <Text style={[styles.fontSizeChipLabel, fontSize === 'large' && styles.fontSizeChipLabelActive, { fontSize: 15 }]}>Aa</Text>
            <Text style={[styles.fontSizeChipSub, fontSize === 'large' && styles.fontSizeChipSubActive]}>
              {t('large')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.8}>
            <Text style={styles.nextButtonText}>{t('next')}</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF8F5',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontFamily: 'ElleGaborStd',
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3B34',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#7A827E',
    lineHeight: 20,
  },
  optionsList: {
    gap: 12,
  },
  settingOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  settingOptionCardActive: {
    borderColor: '#111111',
  },
  settingOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  langFlagImage: {
    width: 28,
    height: 20,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  settingOptionName: {
    fontFamily: 'ElleGaborStd',
    fontSize: 15,
    fontWeight: '600',
    color: '#333333',
  },
  settingOptionNameActive: {
    color: '#000000',
    fontWeight: '700',
  },
  settingOptionDesc: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#111111',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#111111',
  },
  fontSizeGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  fontSizeChip: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E1E8DF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  fontSizeChipActive: {
    borderColor: '#111111',
    backgroundColor: '#111111',
  },
  fontSizeChipLabel: {
    fontFamily: 'ElleGaborStd',
    fontWeight: '600',
    color: '#333333',
  },
  fontSizeChipLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  fontSizeChipSub: {
    fontSize: 12,
    color: '#888888',
    marginTop: 4,
  },
  fontSizeChipSubActive: {
    color: '#D4D4D8',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#FAF8F5',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    paddingVertical: 16,
    borderRadius: 24,
    gap: 8,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  }
});
