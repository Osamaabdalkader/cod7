import { app } from './app.js';
import { database, ref, onValue, update } from './firebase-config.js';

class Dashboard {
  constructor() {
    this.init();
  }

  init() {
    this.loadRecentReferrals();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // مشاركة على وسائل التواصل
    document.getElementById('share-fb').addEventListener('click', () => {
      const url = encodeURIComponent(document.getElementById('referral-link').value);
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
    });
    
    document.getElementById('share-twitter').addEventListener('click', () => {
      const text = encodeURIComponent('انضم إلى هذا الموقع الرائع عبر رابط الإحالة الخاص بي!');
      const url = encodeURIComponent(document.getElementById('referral-link').value);
      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
    });
    
    document.getElementById('share-whatsapp').addEventListener('click', () => {
      const text = encodeURIComponent('انضم إلى هذا الموقع الرائع عبر رابط الإحالة الخاص بي: ');
      const url = encodeURIComponent(document.getElementById('referral-link').value);
      window.open(`https://wa.me/?text=${text}${url}`, '_blank');
    });
  }

  loadRecentReferrals() {
    if (!app.currentUser) return;
    
    try {
      const referralsRef = ref(database, 'userReferrals/' + app.currentUser.uid);
      onValue(referralsRef, (snapshot) => {
        const referralsTable = document.getElementById('recent-referrals');
        
        if (!snapshot.exists()) {
          referralsTable.innerHTML = '<tr><td colspan="4" style="text-align: center;">لا توجد إحالات حتى الآن</td></tr>';
          return;
        }
        
        const referrals = snapshot.val();
        referralsTable.innerHTML = '';
        
        // عرض أحدث 5 إحالات فقط
        const recentReferrals = Object.entries(referrals)
          .sort((a, b) => new Date(b[1].joinDate) - new Date(a[1].joinDate))
          .slice(0, 5);
        
        recentReferrals.forEach(([userId, referralData]) => {
          const row = referralsTable.insertRow();
          row.innerHTML = `
            <td>${referralData.name}</td>
            <td>${referralData.email}</td>
            <td>${new Date(referralData.joinDate).toLocaleDateString('ar-SA')}</td>
            <td><span class="status-badge status-${referralData.status || 'active'}">${referralData.status === 'active' ? 'نشط' : 'غير نشط'}</span></td>
          `;
        });
      });
    } catch (error) {
      console.error("Error loading recent referrals:", error);
    }
  }
}

// تهيئة لوحة التحكم عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
  new Dashboard();
});