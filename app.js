// app.js
import { 
  auth, 
  database, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  ref, 
  set, 
  onValue, 
  update,
  get
} from './firebase-config.js';

// نظام الإحالة المتكامل
class ReferralSystem {
  constructor() {
    this.currentUser = null;
    this.userData = null;
    this.userDataCache = {};
    this.init();
  }

  init() {
    // التحقق من حالة المصادقة
    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
      if (user) {
        this.loadUserData(user.uid);
        this.updateAuthUI(true);
      } else {
        this.updateAuthUI(false);
        // إذا لم يكن في صفحة تسجيل الدخول، إعادة التوجيه
        if (!window.location.pathname.includes('login.html') && 
            !window.location.pathname.includes('register.html') &&
            !window.location.pathname.includes('index.html')) {
          window.location.href = 'index.html';
        }
      }
    });

    // إعداد معالج الأحداث
    this.setupEventListeners();
  }

  setupEventListeners() {
    // تسجيل الدخول
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // إنشاء حساب
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
      registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleRegister();
      });
    }

    // تسجيل الخروج
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.handleLogout();
      });
    }

    // نسخ رابط الإحالة
    const copyBtn = document.getElementById('copy-link-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        this.copyReferralLink();
      });
    }
  }

  async handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const alert = document.getElementById('login-alert');
    
    if (!email || !password) {
      this.showAlert(alert, 'error', 'يرجى ملء جميع الحقول');
      return;
    }
    
    try {
      this.showAlert(alert, 'info', 'جاري تسجيل الدخول...');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      this.showAlert(alert, 'success', 'تم تسجيل الدخول بنجاح');
      
      // تحميل بيانات المستخدم
      await this.loadUserData(userCredential.user.uid);
      
      // الانتقال إلى لوحة التحكم بعد ثانية
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
      
    } catch (error) {
      this.showAlert(alert, 'error', error.message);
    }
  }

  async handleRegister() {
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const referralCode = document.getElementById('referral-code').value;
    const alert = document.getElementById('register-alert');
    
    if (!name || !email || !password) {
      this.showAlert(alert, 'error', 'يرجى ملء جميع الحقول الإلزامية');
      return;
    }
    
    try {
      this.showAlert(alert, 'info', 'جاري إنشاء الحساب...');
      
      // إنشاء المستخدم في Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;
      
      // إنشاء رمز إحالة فريد
      const userReferralCode = this.generateReferralCode();
      
      // حفظ بيانات المستخدم في Realtime Database
      await set(ref(database, 'users/' + userId), {
        name: name,
        email: email,
        referralCode: userReferralCode,
        points: 0,
        rank: 0,
        joinDate: new Date().toISOString(),
        referredBy: referralCode || null,
        status: 'active',
        isAdmin: false // المستخدم العادي ليس مديراً
      });
      
      // حفظ رمز الإحالة للبحث السريع
      await set(ref(database, 'referralCodes/' + userReferralCode), userId);
      
      // إذا كان هناك رمز إحالة، إضافة العلاقة
      if (referralCode) {
        await this.processReferral(referralCode, userId, name, email);
      }
      
      this.showAlert(alert, 'success', 'تم إنشاء الحساب بنجاح');
      
      // الانتقال إلى لوحة التحكم بعد ثانية
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1000);
      
    } catch (error) {
      this.showAlert(alert, 'error', error.message);
    }
  }

  async processReferral(referralCode, newUserId, name, email) {
    try {
      // البحث عن صاحب رمز الإحالة
      const referrerId = await this.getUserIdFromReferralCode(referralCode);
      if (!referrerId) return;
      
      // إضافة المستخدم الجديد إلى قائمة إحالات المُحيل
      await set(ref(database, 'userReferrals/' + referrerId + '/' + newUserId), {
        name: name,
        email: email,
        joinDate: new Date().toISOString(),
        level: 1,
        status: 'active'
      });
      
      // تحديث إحصائيات المُحيل
      await this.updateReferrerStats(referrerId);
      
    } catch (error) {
      console.error("Error processing referral:", error);
    }
  }

  async loadUserData(userId) {
    try {
      const userRef = ref(database, 'users/' + userId);
      onValue(userRef, (snapshot) => {
        this.userData = snapshot.val();
        
        if (this.userData) {
          this.updateUserUI();
          
          // إذا كانت صفحة الشبكة، تحميل الشبكة
          if (window.location.pathname.includes('network.html')) {
            // سيتم تحميل الشبكة من خلال network.js
            console.log("يجب تحميل الشبكة من network.js");
          }
          
          // إذا كانت صفحة الإدارة، تحميل بيانات الإدارة
          if (window.location.pathname.includes('management.html')) {
            // سيتم تحميل البيانات من خلال management.js
            console.log("يجب تحميل بيانات الإدارة من management.js");
          }

          // إذا كانت صفحة المدير، التحقق من الصلاحية
          if (window.location.pathname.includes('admin.html')) {
            if (!this.userData.isAdmin) {
              alert("ليس لديك صلاحية الوصول إلى هذه الصفحة");
              window.location.href = 'dashboard.html';
            }
          }
        }
      });
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  }

  updateUserUI() {
    // تحديث البيانات في واجهة المستخدم
    const usernameEl = document.getElementById('username');
    const userAvatar = document.getElementById('user-avatar');
    const referralsCount = document.getElementById('referrals-count');
    const pointsCount = document.getElementById('points-count');
    const joinDate = document.getElementById('join-date');
    const referralLink = document.getElementById('referral-link');
    const userRank = document.getElementById('user-rank');
    
    if (usernameEl) usernameEl.textContent = this.userData.name;
    if (userAvatar) userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(this.userData.name)}&background=random`;
    if (pointsCount) pointsCount.textContent = this.userData.points || '0';
    if (joinDate && this.userData.joinDate) joinDate.textContent = new Date(this.userData.joinDate).toLocaleDateString('ar-SA');
    if (referralLink) referralLink.value = `${window.location.origin}${window.location.pathname}?ref=${this.userData.referralCode}`;
    if (userRank) userRank.textContent = this.getRankTitle(this.userData.rank || 0);
    
    // تحميل عدد الإحالات
    if (referralsCount && this.currentUser) {
      this.loadReferralsCount(this.currentUser.uid).then(count => {
        referralsCount.textContent = count;
      });
    }

    // تحديث واجهة المستخدم بناءً على صلاحية المدير
    this.updateAuthUI(true);
  }

  async loadReferralsCount(userId) {
    try {
      const referralsRef = ref(database, 'userReferrals/' + userId);
      return new Promise((resolve) => {
        onValue(referralsRef, (snapshot) => {
          resolve(snapshot.exists() ? Object.keys(snapshot.val()).length : 0);
        }, { onlyOnce: true });
      });
    } catch (error) {
      console.error("Error loading referrals count:", error);
      return 0;
    }
  }

  generateReferralCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  async getUserIdFromReferralCode(referralCode) {
    try {
      const codeRef = ref(database, 'referralCodes/' + referralCode);
      return new Promise((resolve) => {
        onValue(codeRef, (snapshot) => {
          resolve(snapshot.val());
        }, { onlyOnce: true });
      });
    } catch (error) {
      console.error("Error getting user ID from referral code:", error);
      return null;
    }
  }

  async updateReferrerStats(referrerId) {
    try {
      // حساب عدد الإحالات الكلي
      const referralsRef = ref(database, 'userReferrals/' + referrerId);
      onValue(referralsRef, (snapshot) => {
        const referralsCount = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        
        // تحديث عدد الإحالات
        update(ref(database, 'users/' + referrerId), {
          referralsCount: referralsCount
        });
      }, { onlyOnce: true });
      
    } catch (error) {
      console.error("Error updating referrer stats:", error);
    }
  }

  copyReferralLink() {
    const referralLink = document.getElementById('referral-link');
    if (!referralLink) return;
    
    referralLink.select();
    document.execCommand('copy');
    
    // تغيير نص الزر مؤقتًا للإشارة إلى أن النسخ تم
    const copyBtn = document.getElementById('copy-link-btn');
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i class="fas fa-check"></i> تم النسخ!';
    
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
    }, 2000);
  }

  updateAuthUI(isLoggedIn) {
    const authElements = document.querySelectorAll('.auth-only');
    const unauthElements = document.querySelectorAll('.unauth-only');
    const adminElements = document.querySelectorAll('.admin-only');
    
    if (isLoggedIn) {
      authElements.forEach(el => el.style.display = 'block');
      unauthElements.forEach(el => el.style.display = 'none');
      
      // إظهار العناصر الإدارية فقط للمديرين
      if (this.userData && this.userData.isAdmin) {
        adminElements.forEach(el => el.style.display = 'block');
        
        // إضافة تبويب المدير إذا لم يكن موجوداً
        if (!document.querySelector('.tab.admin-tab') && document.querySelector('.tabs')) {
          const adminTab = document.createElement('div');
          adminTab.className = 'tab admin-only admin-tab';
          adminTab.onclick = () => window.location.href = 'admin.html';
          adminTab.textContent = 'لوحة المدير';
          document.querySelector('.tabs').appendChild(adminTab);
        }
      } else {
        adminElements.forEach(el => el.style.display = 'none');
      }
    } else {
      authElements.forEach(el => el.style.display = 'none');
      unauthElements.forEach(el => el.style.display = 'block');
      adminElements.forEach(el => el.style.display = 'none');
    }
  }

  async handleLogout() {
    try {
      await signOut(auth);
      window.location.href = 'index.html';
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }

  showAlert(element, type, message) {
    if (!element) return;
    
    element.textContent = message;
    element.className = `alert alert-${type}`;
    element.style.display = 'block';
    
    setTimeout(() => {
      element.style.display = 'none';
    }, 3000);
  }

  getRankTitle(rank) {
    const rankTitles = {
      0: "مبتدئ",
      1: "عضو",
      2: "قائد",
      3: "نائب مدير",
      4: "مدير",
      5: "مدير عام"
    };
    
    return rankTitles[rank] || "مبتدئ";
  }

  // وظائف مساعدة للإدارة
  sendMessage(email) {
    alert(`سيتم إرسال رسالة إلى: ${email}`);
    // يمكن تنفيذ إرسال رسالة هنا
  }

  viewDetails(userId) {
    alert(`عرض تفاصيل المستخدم: ${userId}`);
    // يمكن تنفيذ عرض التفاصيل هنا
  }

  editMember(userId) {
    // افتح نموذج تعديل العضو
    const modal = document.getElementById('edit-modal');
    if (modal) {
      modal.style.display = 'block';
      
      // تحميل بيانات العضو
      this.getUserDetails(userId).then(userData => {
        if (userData) {
          document.getElementById('edit-member-id').value = userId;
          document.getElementById('edit-name').value = userData.name;
          document.getElementById('edit-email').value = userData.email;
          document.getElementById('edit-points').value = userData.points || 0;
          document.getElementById('edit-rank').value = userData.rank || 0;
          document.getElementById('edit-status').value = userData.status || 'active';
        }
      });
    }
  }

  async getUserDetails(userId) {
    try {
      const userRef = ref(database, 'users/' + userId);
      return new Promise((resolve) => {
        onValue(userRef, (snapshot) => {
          resolve(snapshot.val());
        }, { onlyOnce: true });
      });
    } catch (error) {
      console.error("Error getting user details:", error);
      return null;
    }
  }

  // دالة لتعيين مستخدم كمدير (للمشرفين فقط)
  async makeUserAdmin(userId) {
    if (!this.userData || !this.userData.isAdmin) {
      alert("ليس لديك صلاحية تعيين مديرين");
      return;
    }
    
    try {
      await update(ref(database, 'users/' + userId), {
        isAdmin: true
      });
      alert("تم تعيين المستخدم كمدير بنجاح");
    } catch (error) {
      console.error("Error making user admin:", error);
      alert("حدث خطأ أثناء تعيين المدير");
    }
  }
}

// تهيئة التطبيق
const app = new ReferralSystem();

// جعل app متاحًا globally للوظائف المستدعاة من HTML
window.app = app;

// إغلاق النموذج عند النقر على X
document.addEventListener('DOMContentLoaded', function() {
  const modal = document.getElementById('edit-modal');
  if (modal) {
    const closeBtn = modal.querySelector('.close');
    closeBtn.addEventListener('click', function() {
      modal.style.display = 'none';
    });
    
    // إغلاق النموذج عند النقر خارج المحتوى
    window.addEventListener('click', function(event) {
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    });
    
    // معالجة تقديم نموذج التعديل
    const editForm = document.getElementById('edit-member-form');
    if (editForm) {
      editForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const userId = document.getElementById('edit-member-id').value;
        const name = document.getElementById('edit-name').value;
        const email = document.getElementById('edit-email').value;
        const points = document.getElementById('edit-points').value;
        const rank = document.getElementById('edit-rank').value;
        const status = document.getElementById('edit-status').value;
        
        // تحديث بيانات العضو
        update(ref(database, 'users/' + userId), {
          name: name,
          email: email,
          points: points,
          rank: rank,
          status: status
        }).then(() => {
          alert('تم تحديث بيانات العضو بنجاح');
          modal.style.display = 'none';
          location.reload();
        }).catch(error => {
          alert('حدث خطأ أثناء تحديث البيانات: ' + error.message);
        });
      });
    }
  }
});