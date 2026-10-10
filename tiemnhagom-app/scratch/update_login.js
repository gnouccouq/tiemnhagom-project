const fs = require('fs');
const file = 'app/auth/login.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add loginMethod state
code = code.replace(
  "const [isSignUpMode, setIsSignUpMode] = useState(false);",
  "const [isSignUpMode, setIsSignUpMode] = useState(false);\n  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');"
);

// 2. Extract signInWithPhoneSession from useAuth
code = code.replace(
  "signInWithAppleCredential,",
  "signInWithAppleCredential,\n    signInWithPhoneSession,"
);

// 3. Update handleSubmit to support phone login
const newHandleSubmit = `  const handleSubmit = async () => {
    if (loginMethod === 'phone' && !isSignUpMode) {
      if (!phone.trim()) {
        Alert.alert(t('notification'), 'Vui lòng nhập số điện thoại');
        return;
      }
      setLoading(true);
      try {
        await signInWithPhoneSession(phone.trim());
        router.back();
      } catch (err: any) {
        Alert.alert(t('error'), err.message || t('genericError'));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password.trim()) {`;

code = code.replace(
  "  const handleSubmit = async () => {\n    if (!email.trim() || !password.trim()) {",
  newHandleSubmit
);

// 4. Add UI toggle for login method and conditionally show inputs
const oldInputsStart = `            {/* FORM INPUTS (.auth-input-group & .auth-input) */}
            {isSignUpMode && (`

const newInputsStart = `            {/* FORM INPUTS (.auth-input-group & .auth-input) */}
            
            {!isSignUpMode && (
              <View style={styles.methodToggleContainer}>
                <TouchableOpacity 
                  style={[styles.methodTab, loginMethod === 'email' && styles.methodTabActive]}
                  onPress={() => setLoginMethod('email')}
                >
                  <Text style={[styles.methodTabText, loginMethod === 'email' && styles.methodTabTextActive]}>Email</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.methodTab, loginMethod === 'phone' && styles.methodTabActive]}
                  onPress={() => setLoginMethod('phone')}
                >
                  <Text style={[styles.methodTabText, loginMethod === 'phone' && styles.methodTabTextActive]}>Số điện thoại</Text>
                </TouchableOpacity>
              </View>
            )}

            {isSignUpMode && (`

code = code.replace(oldInputsStart, newInputsStart);

// 5. Hide Email and Password if loginMethod is phone
const emailInputBlock = `            <View style={styles.authInputGroup}>
              <TextInput
                style={styles.authInput}
                placeholder={t('emailPlaceholder')}
                placeholderTextColor="#A0A0A0"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.authInputGroup}>
              <TextInput
                style={[styles.authInput, { paddingRight: 48 }]}
                placeholder={t('passwordPlaceholder')}
                placeholderTextColor="#A0A0A0"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.authPasswordToggle}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={19}
                  color="#FFF"
                />
              </TouchableOpacity>
            </View>`;

const conditionalEmailInputBlock = `            {(!isSignUpMode && loginMethod === 'phone') ? (
              <View style={styles.authInputGroup}>
                <TextInput
                  style={styles.authInput}
                  placeholder={t('phonePlaceholder') || 'Số điện thoại'}
                  placeholderTextColor="#A0A0A0"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>
            ) : (
              <>
                <View style={styles.authInputGroup}>
                  <TextInput
                    style={styles.authInput}
                    placeholder={t('emailPlaceholder')}
                    placeholderTextColor="#A0A0A0"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.authInputGroup}>
                  <TextInput
                    style={[styles.authInput, { paddingRight: 48 }]}
                    placeholder={t('passwordPlaceholder')}
                    placeholderTextColor="#A0A0A0"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    style={styles.authPasswordToggle}
                    onPress={() => setShowPassword(!showPassword)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={19}
                      color="#FFF"
                    />
                  </TouchableOpacity>
                </View>
              </>
            )}`;

code = code.replace(emailInputBlock, conditionalEmailInputBlock);

// 7. Add styles for methodToggleContainer
const stylesAddition = `  authInputGroup: {
    marginBottom: 16,
    position: 'relative',
    justifyContent: 'center',
  },
  methodToggleContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 25,
    padding: 4,
  },
  methodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 20,
  },
  methodTabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  methodTabText: {
    color: '#A0A0A0',
    fontFamily: 'ElleGaborStd',
    fontSize: 14,
    fontWeight: '600',
  },
  methodTabTextActive: {
    color: '#FFFFFF',
  },`;

code = code.replace(
  `  authInputGroup: {
    marginBottom: 16,
    position: 'relative',
    justifyContent: 'center',
  },`,
  stylesAddition
);

fs.writeFileSync(file, code);
console.log('Done modifying login.tsx');
