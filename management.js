// management.js
import { app } from './app.js';
import { database, ref, onValue, update, set, push, get } from './firebase-config.js';

class Management {
  constructor() {
    this.allMembers = [];
    this.filteredMembers = [];
    this.currentSort = {
      field: 'joinDate',
      direction: 'desc'
    };
    this.currentPage = 1;
    this.pageSize = 10;
    this.init();
  }

  init() {
    this.setupEventListeners();
    
    if (app.currentUser && app.userData) {
      this.loadManagementData();
    } else {
      // الانتظار حتى يتم تحميل بيانات المستخدم
      const checkUserData = setInterval(() => {
        if (app.userData) {
          clearInterval(checkUserData);
          this.loadManagementData();
        }
      }, 500);
    }
  }

  setupEventListeners() {
    // تطبيق الفلاتر
    const applyFiltersBtn = document.getElementById('apply-filters');
    const resetFiltersBtn = document.getElementById('reset-filters');
    const exportBtn = document.getElementById('export-btn');
    
    if (applyFiltersBtn) {
      applyFiltersBtn.addEventListener('click', () => this.applyFilters());
    }
    
    if (resetFiltersBtn) {
      resetFiltersBtn.addEventListener('click', () => this.resetFilters());
    }
    
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportData());
    }
    
    // إضافة أحداث لأزرار الترتيب
    const sortButtons = document.querySelectorAll('.sort-btn');
    sortButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const sortBy = btn.dataset.sort;
        this.toggleSortOrder(btn, sortBy);
      });
    });
    
    // إضافة أحداث للتبديل بين الصفحات
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageSizeSelect = document.getElementById('page-size');
    
    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', () => this.goToPrevPage());
    }
    
    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', () => this.goToNextPage());
    }
    
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', () => this.changePageSize());
    }

    // إضافة نقاط للمستخدم (للمديرين فقط)
    const addPointsForm = document.getElementById('add-points-form');
    if (addPointsForm && app.userData && app.userData.isAdmin) {
      addPointsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.addPointsToUser();
      });
    }
  }

  async loadManagementData() {
    if (!app.currentUser) return;
    
    try {
      // تحميل جميع أعضاء الشبكة (جميع المستويات)
      this.allMembers = [];
      await this.loadAllNetworkMembers(app.currentUser.uid, 0, 5);
      
      // عرض البيانات في الجدول
      this.renderManagementTable();
      
      // تحديث الإحصائيات
      this.updateStats();
      
    } catch (error) {
      console.error("Error loading management data:", error);
    }
  }

  async loadAllNetworkMembers(userId, currentLevel, maxLevel) {
    if (currentLevel > maxLevel) return;
    
    try {
      // تحميل الإحالات المباشرة لهذا المستخدم
      const referralsRef = ref(database, 'userReferrals/' + userId);
      const snapshot = await get(referralsRef);
      
      if (snapshot.exists()) {
        const referrals = snapshot.val();
        
        for (const referredUserId in referrals) {
          // تحميل بيانات المستخدم المفصلة
          const userRef = ref(database, 'users/' + referredUserId);
          const userSnapshot = await get(userRef);
          
          if (userSnapshot.exists()) {
            const userData = userSnapshot.val();
            
            // إضافة العضو إلى القائمة
            this.allMembers.push({
              ...userData,
              level: currentLevel + 1,
              id: referredUserId
            });
            
            // تحميل الإحالات بشكل متكرر
            await this.loadAllNetworkMembers(referredUserId, currentLevel + 1, maxLevel);
          }
        }
      }
    } catch (error) {
      console.error("Error loading network members:", error);
    }
  }

  async renderManagementTable() {
    const membersTable = document.getElementById('network-members');
    if (!membersTable) return;
    
    membersTable.innerHTML = '';
    
    if (this.allMembers.length === 0) {
      membersTable.innerHTML = '<tr><td colspan="9" style="text-align: center;">لا توجد إحالات حتى الآن</td></tr>';
      return;
    }
    
    // تطبيق الفلاتر والترتيب
    this.filteredMembers = this.applyFiltersToMembers(this.allMembers);
    const sortedMembers = this.sortMembers(this.filteredMembers, this.currentSort.field, this.currentSort.direction);
    
    // حساب عدد الصفحات
    const totalPages = Math.ceil(sortedMembers.length / this.pageSize);
    
    // عرض البيانات للصفحة الحالية فقط
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    const currentPageMembers = sortedMembers.slice(startIndex, endIndex);
    
    for (let i = 0; i < currentPageMembers.length; i++) {
      const member = currentPageMembers[i];
      const referralsCount = await this.loadReferralsCount(member.id);
      
      const row = membersTable.insertRow();
      row.innerHTML = `
        <td>${startIndex + i + 1}</td>
        <td>${member.name}</td>
        <td>${member.email}</td>
        <td><span class="user-badge level-${member.level}">مستوى ${member.level}</span></td>
        <td>${new Date(member.joinDate).toLocaleDateString('ar-SA')}</td>
        <td>${referralsCount}</td>
        <td>${member.points || 0}</td>
        <td><span class="status-badge status-${member.status || 'active'}">${member.status === 'active' ? 'نشط' : 'غير نشط'}</span></td>
        <td>
          <button class="action-btn edit" onclick="app.editMember('${member.id}')"><i class="fas fa-edit"></i></button>
          <button class="action-btn view" onclick="app.viewDetails('${member.id}')"><i class="fas fa-eye"></i></button>
          ${app.userData && app.userData.isAdmin ? `
          <button class="action-btn points" onclick="management.showAddPointsModal('${member.id}')"><i class="fas fa-coins"></i></button>
          ` : ''}
        </td>
      `;
    }
    
    // تحديث واجهة التصفح بين الصفحات
    this.updatePagination(totalPages);
  }

  async loadReferralsCount(userId) {
    try {
      const referralsRef = ref(database, 'userReferrals/' + userId);
      const snapshot = await get(referralsRef);
      return snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
    } catch (error) {
      console.error("Error loading referrals count:", error);
      return 0;
    }
  }

  applyFilters() {
    this.currentPage = 1;
    this.renderManagementTable();
  }

  resetFilters() {
    document.getElementById('level-filter').value = '';
    document.getElementById('status-filter').value = '';
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    document.getElementById('search-input').value = '';
    
    this.currentPage = 1;
    this.renderManagementTable();
  }

  applyFiltersToMembers(members) {
    const levelFilter = document.getElementById('level-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;
    const searchText = document.getElementById('search-input').value.toLowerCase();
    
    return members.filter(member => {
      // تصفية حسب المستوى
      if (levelFilter && member.level != levelFilter) return false;
      
      // تصفية حسب الحالة
      if (statusFilter && member.status !== statusFilter) return false;
      
      // تصفية حسب التاريخ
      if (dateFrom && new Date(member.joinDate) < new Date(dateFrom)) return false;
      if (dateTo && new Date(member.joinDate) > new Date(dateTo)) return false;
      
      // تصفية حسب البحث
      if (searchText && 
          !member.name.toLowerCase().includes(searchText) && 
          !member.email.toLowerCase().includes(searchText)) {
        return false;
      }
      
      return true;
    });
  }

  sortMembers(members, field, direction) {
    return members.sort((a, b) => {
      let valueA = a[field];
      let valueB = b[field];
      
      // معالجة التواريخ
      if (field === 'joinDate') {
        valueA = new Date(valueA);
        valueB = new Date(valueB);
      }
      
      // المقارنة
      if (valueA < valueB) {
        return direction === 'asc' ? -1 : 1;
      }
      if (valueA > valueB) {
        return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  toggleSortOrder(button, field) {
    const icon = button.querySelector('i');
    
    // تبديل اتجاه الترتيب
    if (this.currentSort.field === field) {
      this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSort.field = field;
      this.currentSort.direction = 'asc';
    }
    
    // تحديث الأيقونة
    icon.className = this.currentSort.direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
    
    // إعادة تعيين أيقونات الأزرار الأخرى
    document.querySelectorAll('.sort-btn i').forEach(otherIcon => {
      if (otherIcon !== icon) {
        otherIcon.className = 'fas fa-sort';
      }
    });
    
    // تطبيق الترتيب
    this.renderManagementTable();
  }

  goToPrevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.renderManagementTable();
    }
  }

  goToNextPage() {
    const totalPages = Math.ceil(this.filteredMembers.length / this.pageSize);
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.renderManagementTable();
    }
  }

  changePageSize() {
    this.pageSize = parseInt(document.getElementById('page-size').value);
    this.currentPage = 1;
    this.renderManagementTable();
  }

  updatePagination(totalPages) {
    document.getElementById('pagination-info').textContent = `الصفحة ${this.currentPage} من ${totalPages}`;
    
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    
    prevBtn.disabled = this.currentPage === 1;
    nextBtn.disabled = this.currentPage === totalPages || totalPages === 0;
  }

  updateStats() {
    const totalMembers = this.allMembers.length;
    const activeMembers = this.allMembers.filter(m => m.status === 'active').length;
    const totalPoints = this.allMembers.reduce((sum, m) => sum + (m.points || 0), 0);
    
    if (document.getElementById('total-members')) {
      document.getElementById('total-members').textContent = totalMembers;
    }
    if (document.getElementById('active-members')) {
      document.getElementById('active-members').textContent = activeMembers;
    }
    if (document.getElementById('total-points')) {
      document.getElementById('total-points').textContent = totalPoints;
    }
  }

  exportData() {
    // تصدير البيانات إلى CSV
    const headers = ['الاسم', 'البريد الإلكتروني', 'المستوى', 'تاريخ الانضمام', 'الإحالات', 'النقاط', 'الحالة'];
    const data = this.filteredMembers.map(member => [
      member.name,
      member.email,
      member.level,
      new Date(member.joinDate).toLocaleDateString('ar-SA'),
      member.referralsCount || 0,
      member.points || 0,
      member.status === 'active' ? 'نشط' : 'غير نشط'
    ]);
    
    let csvContent = headers.join(',') + '\n';
    data.forEach(row => {
      csvContent += row.join(',') + '\n';
    });
    
    const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'أعضاء_الشبكة.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  showAddPointsModal(userId) {
    if (!app.userData || !app.userData.isAdmin) return;
    
    const modal = document.getElementById('add-points-modal');
    if (modal) {
      modal.style.display = 'block';
      document.getElementById('points-user-id').value = userId;
      
      // تحميل بيانات المستخدم
      app.getUserDetails(userId).then(userData => {
        if (userData) {
          document.getElementById('points-user-name').textContent = userData.name;
        }
      });
    }
  }

  async addPointsToUser() {
    if (!app.userData || !app.userData.isAdmin) return;
    
    const userId = document.getElementById('points-user-id').value;
    const points = parseInt(document.getElementById('points-amount').value);
    const reason = document.getElementById('points-reason').value;
    
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
        timestamp: new Date().toISOString()
      });
      
      // التحقق من ترقية الرتبة
      await this.checkRankPromotion(userId, newPoints);
      
      alert(`تم إضافة ${points} نقطة إلى المستخدم بنجاح`);
      document.getElementById('add-points-modal').style.display = 'none';
      document.getElementById('points-amount').value = '';
      document.getElementById('points-reason').value = '';
      
      // إعادة تحميل البيانات
      this.loadManagementData();
      
    } catch (error) {
      console.error("Error adding points:", error);
      alert('حدث خطأ أثناء إضافة النقاط');
    }
  }

  async checkRankPromotion(userId, newPoints) {
    try {
      const userData = await app.getUserDetails(userId);
      if (!userData) return;
      
      const currentRank = userData.rank || 0;
      let newRank = currentRank;
      
      // التحقق من شروط الترقية
      if (currentRank === 0 && newPoints >= 100) {
        newRank = 1; // ترقية إلى رتبة عضو
      } else if (currentRank >= 1 && currentRank < 5) {
        // للرتب الأعلى، نتحقق من وجود 3 أشخاص في الفريق برتبة أقل بمستوى واحد
        const hasEnoughTeamMembers = await this.checkTeamRankRequirements(userId, currentRank + 1);
        if (hasEnoughTeamMembers) {
          newRank = currentRank + 1;
        }
      }
      
      // إذا تغيرت الرتبة، نقوم بالتحديث
      if (newRank !== currentRank) {
        await update(ref(database, 'users/' + userId), {
          rank: newRank
        });
        
        // تسجيل الترقية
        const promotionHistoryRef = ref(database, 'promotionHistory/' + userId);
        const newPromotionRef = push(promotionHistoryRef);
        await set(newPromotionRef, {
          fromRank: currentRank,
          toRank: newRank,
          timestamp: new Date().toISOString()
        });
        
        alert(`تم ترقية المستخدم إلى الرتبة ${newRank} (${app.getRankTitle(newRank)})`);
      }
    } catch (error) {
      console.error("Error checking rank promotion:", error);
    }
  }

  async checkTeamRankRequirements(userId, targetRank) {
    try {
      // الحصول على جميع أعضاء فريق المستخدم
      const teamMembers = [];
      await this.loadTeamMembers(userId, teamMembers, 0, 5);
      
      // عد عدد الأعضاء الذين لديهم الرتبة المطلوبة (الرتبة المستهدفة - 1)
      const requiredRank = targetRank - 1;
      const qualifiedMembers = teamMembers.filter(member => 
        (member.rank || 0) >= requiredRank
      );
      
      // يجب أن يكون هناك 3 أعضاء على الأقل بالرتبة المطلوبة
      return qualifiedMembers.length >= 3;
    } catch (error) {
      console.error("Error checking team rank requirements:", error);
      return false;
    }
  }

  async loadTeamMembers(userId, teamMembers, currentLevel, maxLevel) {
    if (currentLevel > maxLevel) return;
    
    try {
      // تحميل الإحالات المباشرة لهذا المستخدم
      const referralsRef = ref(database, 'userReferrals/' + userId);
      const snapshot = await get(referralsRef);
      
      if (snapshot.exists()) {
        const referrals = snapshot.val();
        
        for (const referredUserId in referrals) {
          // تحميل بيانات المستخدم المفصلة
          const userRef = ref(database, 'users/' + referredUserId);
          const userSnapshot = await get(userRef);
          
          if (userSnapshot.exists()) {
            const userData = userSnapshot.val();
            
            // إضافة العضو إلى القائمة
            teamMembers.push({
              ...userData,
              level: currentLevel + 1,
              id: referredUserId
            });
            
            // تحميل الإحالات بشكل متكرر
            await this.loadTeamMembers(referredUserId, teamMembers, currentLevel + 1, maxLevel);
          }
        }
      }
    } catch (error) {
      console.error("Error loading team members:", error);
    }
  }
}

// تهيئة نظام الإدارة عند تحميل الصفحة
let management;
document.addEventListener('DOMContentLoaded', function() {
  management = new Management();
  window.management = management;
});

// إغلاق النوافذ المنبثقة
document.addEventListener('DOMContentLoaded', function() {
  // إغلاق نافذة إضافة النقاط
  const pointsModal = document.getElementById('add-points-modal');
  if (pointsModal) {
    const closeBtn = pointsModal.querySelector('.close');
    closeBtn.addEventListener('click', function() {
      pointsModal.style.display = 'none';
    });
    
    // إغلاق النافذة عند النقر خارج المحتوى
    window.addEventListener('click', function(event) {
      if (event.target === pointsModal) {
        pointsModal.style.display = 'none';
      }
    });
  }
});