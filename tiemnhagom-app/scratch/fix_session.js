const fs = require('fs');

function fixProfile() {
  const file = 'app/(tabs)/profile.tsx';
  let code = fs.readFileSync(file, 'utf8');

  code = code.replace(/if \(user\) \{/g, 'if (user || userProfile) {');
  code = code.replace(/getUserOrders\(user\.uid\)/g, "getUserOrders(user?.uid || userProfile?.uid || '')");
  code = code.replace(/onPress=\{.*\buser \? router\.push\('\/edit-profile'\) : router\.push\('\/auth\/login'\)\}/g, "onPress={() => ((user || userProfile) ? router.push('/edit-profile') : router.push('/auth/login'))}");
  code = code.replace(/\{user \? displayName : \(t\('loginRegister'\)/g, "{(user || userProfile) ? displayName : (t('loginRegister')");
  code = code.replace(/\{user \? \(/g, "{(user || userProfile) ? (");
  code = code.replace(/const isLoggedIn = !!user;/g, "const isLoggedIn = !!user || !!userProfile;");

  fs.writeFileSync(file, code);
  console.log('Fixed profile.tsx');
}

function fixSettings() {
  const file = 'app/settings.tsx';
  let code = fs.readFileSync(file, 'utf8');
  
  // Find where it checks {user && ( ... logout button ... )}
  // Actually, we can just replace {user && ( with {(user || userProfile) && (
  // But let's check exact matches
  code = code.replace(/\{user \&\& \(/g, "{(user || userProfile) && (");
  
  // also check user.delete
  code = code.replace(/if \(user \&\& user\.delete\) \{/g, "if (user && user.delete) {"); // leave this as is since userProfile doesn't have delete method
  
  fs.writeFileSync(file, code);
  console.log('Fixed settings.tsx');
}

fixProfile();
fixSettings();
