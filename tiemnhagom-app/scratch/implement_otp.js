const fs = require('fs');
const file = 'app/auth/login.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add imports
const importTarget = `import { useAuth } from '../../src/context/AuthContext';`;
const newImports = `import { useAuth } from '../../src/context/AuthContext';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { PhoneAuthProvider, signInWithCredential } from 'firebase/auth';
import { app as firebaseApp, auth, db } from '../../src/config/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';`;
if (!code.includes('FirebaseRecaptchaVerifierModal')) {
  code = code.replace(importTarget, newImports);
}

// 2. Add state inside LoginScreen
const stateTarget = `const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');`;
const newState = `const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const recaptchaVerifier = useRef(null);
  const [verificationId, setVerificationId] = useState('');
  const [otp, setOtp] = useState('');
  const [isOtpMode, setIsOtpMode] = useState(false);`;
if (!code.includes('isOtpMode')) {
  code = code.replace(stateTarget, newState);
}

// 3. Add handleVerifyOtp function
const handleTarget = `  const handleSubmit = async () => {`;
const verifyOtpFunc = `  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      Alert.alert(t('notification') || 'Thông báo', 'Vui lòng nhập mã OTP');
      return;
    }
    setLoading(true);
    try {
      const cred = PhoneAuthProvider.credential(verificationId, otp);
      const userCred = await signInWithCredential(auth, cred);
      
      const userDocRef = doc(db, 'users', userCred.user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        const newProfile = {
          uid: userCred.user.uid,
          email: null,
          phone: phone.trim(),
          displayName: \`Khách hàng \${phone.slice(-4)}\`,
          points: 0,
          tier: 'standard',
        };
        await setDoc(userDocRef, { ...newProfile, createdAt: serverTimestamp() }, { merge: true });
      }
      
      router.back();
    } catch (err: any) {
      Alert.alert(t('error') || 'Lỗi', 'Mã OTP không hợp lệ hoặc đã hết hạn.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {`;
if (!code.includes('handleVerifyOtp')) {
  code = code.replace(handleTarget, verifyOtpFunc);
}

// 4. Update handleSubmit for phone
const oldSubmitTarget = `    if (loginMethod === 'phone' && !isSignUpMode) {
      if (!phone.trim()) {
        Alert.alert(t('notification') || 'Thông báo', 'Vui lòng nhập số điện thoại');
        return;
      }
      setLoading(true);
      try {
        await signInWithPhoneSession(phone.trim());
        router.back();
      } catch (err: any) {
        Alert.alert(t('error') || 'Lỗi', err.message || t('genericError'));
      } finally {
        setLoading(false);
      }
      return;
    }`;

const newSubmit = `    if (loginMethod === 'phone' && !isSignUpMode) {
      if (!phone.trim()) {
        Alert.alert(t('notification') || 'Thông báo', 'Vui lòng nhập số điện thoại');
        return;
      }
      setLoading(true);
      try {
        let formattedPhone = phone.trim();
        if (formattedPhone.startsWith('0')) {
          formattedPhone = '+84' + formattedPhone.slice(1);
        } else if (!formattedPhone.startsWith('+')) {
          formattedPhone = '+84' + formattedPhone;
        }

        const phoneProvider = new PhoneAuthProvider(auth);
        const vid = await phoneProvider.verifyPhoneNumber(formattedPhone, recaptchaVerifier.current);
        setVerificationId(vid);
        setIsOtpMode(true);
      } catch (err: any) {
        Alert.alert(t('error') || 'Lỗi', err.message || t('genericError'));
      } finally {
        setLoading(false);
      }
      return;
    }`;
code = code.replace(oldSubmitTarget, newSubmit);

// 5. Update UI to conditionally render OTP form
// We need to find the <View style={styles.authCard}> ... </View> content
const uiTarget = `            {(!isSignUpMode && loginMethod === 'phone') ? (
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
            ) : (`;

const newUi = `            {isOtpMode ? (
              <View style={styles.authInputGroup}>
                <TextInput
                  style={styles.authInput}
                  placeholder="Nhập mã OTP (6 số)"
                  placeholderTextColor="#A0A0A0"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
            ) : (!isSignUpMode && loginMethod === 'phone') ? (
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
            ) : (`;
code = code.replace(uiTarget, newUi);

// 6. Update SUBMIT BUTTON onPress to handle handleVerifyOtp
const btnTarget = `            {/* SUBMIT BUTTON */}
            <TouchableOpacity
              style={[styles.btnAuthSubmit, loading && styles.btnDisabled]}
              onPress={handleSubmit}`;

const newBtn = `            {/* SUBMIT BUTTON */}
            <TouchableOpacity
              style={[styles.btnAuthSubmit, loading && styles.btnDisabled]}
              onPress={isOtpMode ? handleVerifyOtp : handleSubmit}`;
code = code.replace(btnTarget, newBtn);

// 7. Inject RecaptchaVerifierModal inside SafeAreaView
const safeAreaTarget = `    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView`;

const newSafeArea = `    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaVerifier}
        firebaseConfig={firebaseApp.options}
        attemptInvisibleVerification={true}
      />
      <KeyboardAvoidingView`;
code = code.replace(safeAreaTarget, newSafeArea);

fs.writeFileSync(file, code);
console.log('OTP implementation complete!');
