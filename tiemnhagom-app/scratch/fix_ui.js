const fs = require('fs');
const file = 'app/auth/login.tsx';
let code = fs.readFileSync(file, 'utf8');

// Normalize to LF for easy replacing
code = code.replace(/\r\n/g, '\n');

const chunk1Target = `            {/* FORM INPUTS (.auth-input-group & .auth-input) */}
            {isSignUpMode && (
              <>`;

const chunk1Replacement = `            {/* FORM INPUTS (.auth-input-group & .auth-input) */}
            
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
              <>`;

const chunk2Target = `            <View style={styles.authInputGroup}>
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

const chunk2Replacement = `            {(!isSignUpMode && loginMethod === 'phone') ? (
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

code = code.replace(chunk1Target, chunk1Replacement);
code = code.replace(chunk2Target, chunk2Replacement);

fs.writeFileSync(file, code);
console.log('UI updated');
