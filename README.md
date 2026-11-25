# تطبيق مركز الفتح (PWA + APK)

## محتوى المجلد
- index.html / app.js : التطبيق (التعليم، الأعمال، طلب عمل، حسابي، الموقع)
- firebase-config.js : **الملف الوحيد الذي تعدله** (بيانات Firebase وأرقام التواصل)
- firestore.rules : قواعد الأمان (تُلصق في Firebase Console)
- manifest.json / sw.js / icon-*.png : لتحويله لتطبيق قابل للتثبيت
- firebase.json : للنشر عبر Firebase CLI (اختياري)

## الخطوات من الموبايل فقط

### 1) Firebase Console (console.firebase.google.com، مشروع alfath-motors)
1. Build > Authentication > Get started > فعّل **Email/Password**.
2. Build > Firestore Database > Create database (اختر أقرب منطقة، وضع Production).
3. Firestore > Rules > الصق محتوى firestore.rules > Publish.
4. Project settings > Your apps > أضف تطبيق ويب (</>) > انسخ قيم firebaseConfig.
5. افتح firebase-config.js والصق القيم (apiKey و messagingSenderId و appId) وعدّل أرقام الهاتف والواتساب.

### 2) النشر على رابط https
أسهل طريق من الموبايل بدون كمبيوتر:
- **GitHub Pages**: أنشئ مستودع عام، ارفع كل ملفات المجلد (Add file > Upload files)، ثم Settings > Pages > Deploy from branch (main).
- أو Cloudflare Pages / Netlify برفع المجلد.
- أو Firebase Hosting (يحتاج Firebase CLI على كمبيوتر).

بعد النشر أضف نطاق الموقع في: Authentication > Settings > **Authorized domains**.

### 3) تحويل الرابط إلى APK
1. افتح pwabuilder.com من متصفح الموبايل وضع رابط موقعك.
2. اضغط Package for stores > Android > Generate.
3. نزّل الملف، وستجد APK جاهز للتثبيت (وAAB لمتجر Google Play).
بديل بدون APK: افتح الرابط في Chrome > القائمة > "تثبيت التطبيق".

### 4) حساب المدير (أنت)
1. من التطبيق أنشئ حساباً برقم هاتفك.
2. Firebase Console > Authentication > Users > انسخ **User UID** الخاص بك.
3. Firestore > Start collection باسم **admins** > Document ID = الـ UID الذي نسخته > أضف حقل أي قيمة (مثل role = admin).
4. أعد فتح التطبيق: ستظهر لك إدارة العملاء (مديونية/سداد/شات) وتغيير حالة الطلبات ورفع صور المعرض.

### دعوة العملاء
أرسل رابط التطبيق أو ملف APK للعميل، يسجل برقم هاتفه ويرى حسابه ويحادثك ويرسل الطلبات.

## ملاحظات
- الصور تُخزن مضغوطة داخل Firestore (لا تحتاج Storage المدفوع). مناسبة لعشرات الصور.
- الإشعارات (Push) غير مفعلة بعد، وتحتاج خطوة إضافية (Firebase Cloud Messaging).
- بيانات جدول الأسلاك والمخططات تقريبية للتعليم كما في الموقع الأصلي.
