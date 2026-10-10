const fs = require('fs');
const file = 'app/auth/login.tsx';
let code = fs.readFileSync(file, 'utf8');

// Normalize to LF
code = code.replace(/\r\n/g, '\n');

// 1. Remove methodToggleContainer
const removeTarget = `            {!isSignUpMode && (
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

`;
code = code.replace(removeTarget, '');

// 2. Add Toggle to socialButtonsRow
const socialRowTarget = `            <View style={styles.socialButtonsRow}>
              {/* FACEBOOK */}`;

const socialRowReplacement = `            <View style={styles.socialButtonsRow}>
              {/* PHONE/EMAIL TOGGLE */}
              {!isSignUpMode && (
                <ScalePressable
                  style={styles.socialCircleBtn}
                  onPress={() => setLoginMethod(loginMethod === 'email' ? 'phone' : 'email')}
                  accessibilityLabel="Toggle login method"
                >
                  <Ionicons 
                    name={loginMethod === 'email' ? 'call' : 'mail'} 
                    size={24} 
                    color="#000" 
                  />
                </ScalePressable>
              )}

              {/* FACEBOOK */}`;

code = code.replace(socialRowTarget, socialRowReplacement);

fs.writeFileSync(file, code);
console.log('UI updated for social row toggle');
