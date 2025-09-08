// network.js
import { app } from './app.js';
import { database, ref, onValue, get } from './firebase-config.js';

class Network {
  constructor() {
    this.init();
  }

  init() {
    // الانتظار حتى يتم تحميل بيانات المستخدم
    if (app.currentUser && app.userData) {
      this.loadNetwork();
    } else {
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
      // البدء بشجرة الشبكة من المستخدم الحالي
      const networkTree = await this.buildNetworkTree(app.currentUser.uid, 0, 5);
      this.renderNetwork(networkTree, networkContainer);
    } catch (error) {
      console.error("Error loading network:", error);
      networkContainer.innerHTML = '<div class="error">فشل في تحميل الشبكة</div>';
    }
  }

  async buildNetworkTree(userId, currentLevel, maxLevel) {
    if (currentLevel > maxLevel) return null;
    
    try {
      // تحميل بيانات المستخدم
      const userRef = ref(database, 'users/' + userId);
      const userSnapshot = await get(userRef);
      
      if (!userSnapshot.exists()) return null;
      
      const userData = userSnapshot.val();
      const node = {
        id: userId,
        data: userData,
        level: currentLevel,
        children: []
      };
      
      // تحميل الإحالات إذا كان ضمن المستوى المسموح
      if (currentLevel < maxLevel) {
        const referralsRef = ref(database, 'userReferrals/' + userId);
        const referralsSnapshot = await get(referralsRef);
        
        if (referralsSnapshot.exists()) {
          const referrals = referralsSnapshot.val();
          
          for (const referredUserId in referrals) {
            const childNode = await this.buildNetworkTree(referredUserId, currentLevel + 1, maxLevel);
            if (childNode) {
              node.children.push(childNode);
            }
          }
        }
      }
      
      return node;
    } catch (error) {
      console.error("Error building network tree:", error);
      return null;
    }
  }

  renderNetwork(node, container) {
    container.innerHTML = '';
    
    if (!node) {
      container.innerHTML = '<div class="empty-state">لا توجد إحالات حتى الآن</div>';
      return;
    }
    
    this.renderNode(node, container);
  }

  renderNode(node, container) {
    const nodeElement = document.createElement('div');
    nodeElement.className = `network-node level-${node.level}`;
    
    nodeElement.innerHTML = `
      <div class="node-header">
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(node.data.name)}&background=random" alt="صورة المستخدم">
        <div class="node-info">
          <h4>${node.data.name}</h4>
          <p>${node.data.email}</p>
          <div>
            <span class="user-level">المستوى: ${node.level}</span>
            <span class="user-rank">الرتبة: ${app.getRankTitle(node.data.rank || 0)}</span>
          </div>
        </div>
        <div class="node-stats">
          <span class="points">${node.data.points || 0} نقطة</span>
        </div>
      </div>
    `;
    
    // إذا كان هناك أطفال، إضافة زر للتوسيع
    if (node.children && node.children.length > 0) {
      const expandBtn = document.createElement('button');
      expandBtn.className = 'expand-btn';
      expandBtn.innerHTML = `<i class="fas fa-chevron-down"></i> ${node.children.length} إحالة`;
      
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'node-children';
      childrenContainer.style.display = 'none';
      
      expandBtn.onclick = () => {
        if (childrenContainer.style.display === 'none') {
          childrenContainer.style.display = 'block';
          expandBtn.innerHTML = `<i class="fas fa-chevron-up"></i> ${node.children.length} إحالة`;
          
          // تحميل الأطفال إذا لم يتم تحميلهم من قبل
          if (childrenContainer.innerHTML === '') {
            node.children.forEach(child => {
              this.renderNode(child, childrenContainer);
            });
          }
        } else {
          childrenContainer.style.display = 'none';
          expandBtn.innerHTML = `<i class="fas fa-chevron-down"></i> ${node.children.length} إحالة`;
        }
      };
      
      nodeElement.appendChild(expandBtn);
      nodeElement.appendChild(childrenContainer);
    }
    
    container.appendChild(nodeElement);
  }
}

// تهيئة الشبكة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
  new Network();
});
