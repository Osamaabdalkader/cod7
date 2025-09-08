import { app } from './app.js';
import { database, ref, onValue, update, set, push, get } from './firebase-config.js';

class AdminPanel {
  constructor() {
    this.init();
  }

  init() {
    // التحقق من صلاحية المدير
    if (!app.userData || !app.userData.isAdmin) {
      window.location.href = 'dashboard.html';
      return;
    }
    
    this.loadAllUsers();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // البحث عن المستخدمين
    const searchInput = document.getElementById('admin-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterUsers(e.target.value);
      });
    }
    
    // تعيين مدير جديد
    const makeAdminForm = document.getElementById('make-admin-form');
    if (makeAdminForm) {
      makeAdminForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.makeUserAdmin();
      });
    }
    
    // إضافة نقاط من قبل المدير
    const adminAddPointsForm = document.getElementById('admin-add-points-form');
    if (adminAddPointsForm) {
      adminAddPointsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.adminAddPoints();
      });
    }
  }

  async loadAllUsers() {
    try {
      const usersRef = ref(database, 'users');
      onValue(usersRef, (snapshot) => {
        if (snapshot.exists()) {
          const users = snapshot.val();
          this.renderUsersTable(users);
        }
      });
    } catch (error) {
      console.error("Error loading all users:", error);
    }
  }

  renderUsersTable(users) {
    const usersTable = document.getElementById('all-users-table');
    if (!usersTable) return;
    
    usersTable.innerHTML = '';
    
    if (!users || Object.keys(users).length === 0) {
      usersTable.innerHTML = '<tr><td colspan="8" style="text-align: center;">لا يوجد مستخدمين</td></tr>';
      return;
    }
    
    Object.entries(users).forEach(([userId, userData]) => {
      const row = usersTable.insertRow();
      row.innerHTML = `
        <td>${userData.name}</td>
        <td>${userData.email}</td>
        <td>${userData.referralCode}</td>
        <td><span class="user-rank">${app.getRankTitle(userData.rank || 0)}</span></td>
        <td>${userData.points || 0}</td>
        <td>${new Date(userData.joinDate).toLocaleDateString('ar-SA')}</td>
        <td><span class="status-badge status-${userData.status || 'active'}">${userData.status === 'active' ? 'نشط' : 'غير نشط'}</span></td>
        <td>
          <button class="action-btn edit" onclick="app.editMember('${userId}')"><i class="fas fa-edit"></i></button>
          <button class="action-btn points" onclick="adminPanel.showAdminAddPointsModal('${userId}')"><i class="fas fa-coins"></i></button>
          ${!userData.isAdmin ? `
          <button class="action-btn admin" onclick="adminPanel.showMakeAdminModal('${userId}')"><i class="fas fa-crown"></i></button>
          ` : ''}
        </td>
      `;
    });
  }

  filterUsers(searchText) {
    const usersTable = document.getElementById('all-users-table');
    const rows = usersTable.getElementsByTagName('tr');
    
    for (let i = 1; i < rows.length; i++) {
      const name = rows[i].cells[0].textContent.toLowerCase();
      const email = rows[i].cells[1].textContent.toLowerCase();
      const shouldShow = name.includes(searchText.toLowerCase()) || email.includes(searchText.toLowerCase());
      rows[i].style.display = shouldShow ? '' : 'none';
    }
  }

  showMakeAdminModal(userId) {
    const modal = document.getElementById('make-admin-modal');
    if (modal) {
      modal.style.display = 'block';
      document.getElementById('admin-user-id').value = userId;
      
      // تحميل بيانات المستخدم
      app.getUserDetails(userId).then(userData => {
        if (userData) {
          document.getElementById('admin-user-name').textContent = userData.name;
        }
      });
    }
  }

  async makeUserAdmin() {
    const userId = document.getElementById('admin-user-id').value;
    
    if (!userId) {
      alert('لم يتم تحديد مستخدم');
      return;
    }
    
    try {
      // تعيين المستخدم كمدير
      await update(ref(database, 'users/' + userId), {
        isAdmin: true
      });
      
      alert('تم تعيين المستخدم كمدير بنجاح');
      document.getElementById('make-admin-modal').style.display = 'none';
      
    } catch (error) {
      console.error("Error making user admin:", error);
      alert('حدث خطأ أثناء تعيين المدير');
    }
  }

  showAdminAddPointsModal(userId) {
    const modal = document.getElementById('admin-add-points-modal');
    if (modal) {
      modal.style.display = 'block';
      document.getElementById('admin-points-user-id').value = userId;
      
      // تحميل بيانات المستخدم
      app.getUserDetails(userId).then(userData => {
        if (userData) {
          document.getElementById('admin-points-user-name').textContent = userData.name;
        }
      });
    }
  }

  async adminAddPoints() {
    const userId = document.getElementById('admin-points-user-id').value;
    const points = parseInt(document.getElementById('admin-points-amount').value);
    const reason = document.getElementById('admin-points-reason').value;
    
    if (!userId || isNaN(points) || points <= 0) {
      alert('يرجى إدخال عدد نقاط صحيح');
      return;
    }
    
    try {
      // تحميل بيانات المستخدم الحالية
      const userData = await app.getUserDetails(userId);
      if (!userData) {
        alert('لم يتم العثور على المستخدم');
        return;
      }
      
      // تحديث النقاط
      const newPoints = (userData.points || 0) + points;
      await update(ref(database, 'users/' + userId), {
        points: newPoints
      });
      
      // تسجيل عملية إضافة النقاط
      const pointsHistoryRef = ref(database, 'pointsHistory/' + userId);
      const newHistoryRef = push(pointsHistoryRef);
      await set(newHistoryRef, {
        points: points,
        reason: reason,
        addedBy: app.currentUser.uid,
        addedByName: app.userData.name,
        timestamp: new Date().toISOString(),
        isAdminAction: true
      });
      
      // التحقق من ترقية الرتبة
      await management.checkRankPromotion(userId, newPoints);
      
      alert(`تم إضافة ${points} نقطة إلى المستخدم بنجاح`);
      document.getElementById('admin-add-points-modal').style.display = 'none';
      document.getElementById('admin-points-amount').value = '';
      document.getElementById('admin-points-reason').value = '';
      
      // إعادة تحميل البيانات
      this.loadAllUsers();
      
    } catch (error) {
      console.error("Error adding points:", error);
      alert('حدث خطأ أثناء إضافة النقاط');
    }
  }
}

// تهيئة لوحة الإدارة عند تحميل الصفحة
let adminPanel;
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('all-users-table')) {
    adminPanel = new AdminPanel();
    window.adminPanel = adminPanel;
  }
});

// إغلاق النوافذ المنبثقة
document.addEventListener('DOMContentLoaded', function() {
  // إغلاق نافذة تعيين المدير
  const makeAdminModal = document.getElementById('make-admin-modal');
  if (makeAdminModal) {
    const closeBtn = makeAdminModal.querySelector('.close');
    closeBtn.addEventListener('click', function() {
      makeAdminModal.style.display = 'none';
    });
    
    // إغلاق النافذة عند النقر خارج المحتوى
    window.addEventListener('click', function(event) {
      if (event.target === makeAdminModal) {
        makeAdminModal.style.display = 'none';
      }
    });
  }
  
  // إغلاق نافذة إضافة النقاط من المدير
  const adminAddPointsModal = document.getElementById('admin-add-points-modal');
  if (adminAddPointsModal) {
    const closeBtn = adminAddPointsModal.querySelector('.close');
    closeBtn.addEventListener('click', function() {
      adminAddPointsModal.style.display = 'none';
    });
    
    // إغلاق النافذة عند النقر خارج المحتوى
    window.addEventListener('click', function(event) {
      if (event.target === adminAddPointsModal) {
        adminAddPointsModal.style.display = 'none';
      }
    });
  }
});