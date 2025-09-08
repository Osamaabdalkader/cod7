// network.js
import { app } from './app.js';
import { database, ref, onValue } from './firebase-config.js';

class Network {
  constructor() {
    this.init();
  }

  init() {
    if (app.currentUser && app.userData) {
      this.loadNetwork();
    } else {
      // الانتظار حتى يتم تحميل بيانات المستخدم
      const checkUserData = setInterval(() => {
        if (app.userData) {
          clearInterval(checkUserData);
          this.loadNetwork();
        }
      }, 500);
    }
  }

  async loadNetwork() {
    const networkContainer = document.getElementById('network-container');
    if (!networkContainer || !app.currentUser) return;
    
    networkContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جاري تحميل الشبكة...</div>';
    
    try {
      // تحميل الشبكة الكاملة
      const network = {};
      await this.loadNetworkRecursive(app.currentUser.uid, network, 0, 5);
      
      // عرض الشبكة
      this.renderNetwork(network, networkContainer);
      
    } catch (error) {
      console.error("Error loading network:", error);
      networkContainer.innerHTML = '<div class="error">فشل في تحميل الشبكة</div>';
    }
  }

  async loadNetworkRecursive(userId, network, currentLevel, maxLevel) {
    if (currentLevel > maxLevel) return;
    
    try {
      const referralsRef = ref(database, 'userReferrals/' + userId);
      
      // استخدام onValue للاستماع للتغييرات
      onValue(referralsRef, (snapshot) => {
        if (snapshot.exists()) {
          const referrals = snapshot.val();
          network[userId] = {
            level: currentLevel,
            referrals: {}
          };
          
          // تحميل بيانات المستخدم إذا لم تكن موجودة مسبقًا
          if (!app.userDataCache[userId]) {
            const userRef = ref(database, 'users/' + userId);
            onValue(userRef, (userSnapshot) => {
              if (userSnapshot.exists()) {
                app.userDataCache[userId] = userSnapshot.val();
                network[userId].data = app.userDataCache[userId];
                
                // تحميل الإحالات بشكل متكرر
                for (const referredUserId in referrals) {
                  network[userId].referrals[referredUserId] = {
                    data: referrals[referredUserId],
                    level: currentLevel + 1
                  };
                  
                  this.loadNetworkRecursive(
                    referredUserId, 
                    network[userId].referrals, 
                    currentLevel + 1, 
                    maxLevel
                  );
                }
                
                // إعادة عرض الشبكة بعد تحميل البيانات
                if (userId === app.currentUser.uid) {
                  const networkContainer = document.getElementById('network-container');
                  this.renderNetwork(network, networkContainer);
                }
              }
            }, { onlyOnce: true });
          } else {
            network[userId].data = app.userDataCache[userId];
            for (const referredUserId in referrals) {
              network[userId].referrals[referredUserId] = {
                data: referrals[referredUserId],
                level: currentLevel + 1
              };
              
              this.loadNetworkRecursive(
                referredUserId, 
                network[userId].referrals, 
                currentLevel + 1, 
                maxLevel
              );
            }
          }
        } else if (userId === app.currentUser.uid) {
          // لا توجد إحالات
          const networkContainer = document.getElementById('network-container');
          networkContainer.innerHTML = '<div class="empty-state">لا توجد إحالات حتى الآن</div>';
        }
      }, { onlyOnce: true });
    } catch (error) {
      console.error("Error loading network recursively:", error);
    }
  }

  renderNetwork(network, container) {
    container.innerHTML = '';
    
    if (!network || Object.keys(network).length === 0 || !network[app.currentUser.uid]) {
      container.innerHTML = '<div class="empty-state">لا توجد إحالات حتى الآن</div>';
      return;
    }
    
    // البدء من المستخدم الحالي
    this.renderNetworkNode(app.currentUser.uid, network, container, 0);
  }

  renderNetworkNode(userId, network, container, level) {
    if (!network[userId] || !network[userId].data) return;
    
    const nodeData = network[userId].data;
    const referrals = network[userId].referrals;
    
    const nodeElement = document.createElement('div');
    nodeElement.className = `network-node level-${level}`;
    
    nodeElement.innerHTML = `
      <div class="node-header">
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(nodeData.name)}&background=random" alt="صورة المستخدم">
        <div class="node-info">
          <h4>${nodeData.name}</h4>
          <p>${nodeData.email}</p>
          <div>
            <span class="user-level">المستوى: ${level}</span>
            <span class="user-rank">الرتبة: ${app.getRankTitle(nodeData.rank || 0)}</span>
          </div>
        </div>
        <div class="node-stats">
          <span class="points">${nodeData.points || 0} نقطة</span>
        </div>
      </div>
    `;
    
    // إذا كان هناك إحالات، إضافة زر للتوسيع
    if (referrals && Object.keys(referrals).length > 0) {
      const expandBtn = document.createElement('button');
      expandBtn.className = 'expand-btn';
      expandBtn.innerHTML = `<i class="fas fa-chevron-down"></i> ${Object.keys(referrals).length} إحالة`;
      expandBtn.onclick = () => this.toggleNodeExpansion(nodeElement, referrals, level + 1);
      nodeElement.appendChild(expandBtn);
    }
    
    container.appendChild(nodeElement);
  }

  toggleNodeExpansion(node, referrals, level) {
    const childrenContainer = node.querySelector('.node-children');
    
    if (childrenContainer) {
      // إذا كان هناك حاوية أطفال بالفعل، قم بالتبديل
      childrenContainer.style.display = childrenContainer.style.display === 'none' ? 'block' : 'none';
      
      // تحديث أيقونة الزر
      const icon = node.querySelector('.expand-btn i');
      if (childrenContainer.style.display === 'none') {
        icon.className = 'fas fa-chevron-down';
      } else {
        icon.className = 'fas fa-chevron-up';
      }
    } else {
      // إذا لم تكن هناك حاوية أطفال، قم بإنشائها وعرضها
      const newChildrenContainer = document.createElement('div');
      newChildrenContainer.className = 'node-children';
      
      for (const referredUserId in referrals) {
        this.renderNetworkNode(referredUserId, referrals, newChildrenContainer, level);
      }
      
      node.appendChild(newChildrenContainer);
      
      // تحديث أيقونة الزر
      const icon = node.querySelector('.expand-btn i');
      icon.className = 'fas fa-chevron-up';
    }
  }
}

// تهيئة الشبكة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
  new Network();
});