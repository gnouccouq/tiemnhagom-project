const fs = require('fs');
const file = 'app/auth/login.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add method toggle container
code = code.replace(
  /\{\/\* FORM INPUTS \(\.auth-input-group & \.auth-input\) \*\/\}\r?\n\s*\{isSignUpMode && \(\r?\n\s*<>/m,
  \`{/* FORM INPUTS (.auth-input-group & .auth-input) */}
            
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

            {isSignUpMode && (
              <>\`
);

// 2. Hide email/password conditionally
const regex = /<View style=\{styles\.authInputGroup\}>\r?\n\s*<TextInput\r?\n\s*style=\{styles\.authInput\}\r?\n\s*placeholder=\{t\('emailPlaceholder'\)\}[\s\S]*?<TouchableOpacity\r?\n\s*style=\{styles\.authPasswordToggle\}[\s\S]*?<\/TouchableOpacity>\r?\n\s*<\/View>/m;

code = code.replace(regex, \`{(!isSignUpMode && loginMethod === 'phone') ? (
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
            )}\`);

fs.writeFileSync(file, code);
console.log('Update complete');
