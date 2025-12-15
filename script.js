// === Firebase Configuration ===
const firebaseConfig = {
    apiKey: "AIzaSyCaFWQMAaW5bONllhHuxh3RTzBTQ6aVkKg",
    authDomain: "abuhassan-store.firebaseapp.com",
    databaseURL: "https://abuhassan-store-default-rtdb.firebaseio.com",
    projectId: "abuhassan-store",
    storageBucket: "abuhassan-store.firebasestorage.app",
    messagingSenderId: "514058614752",
    appId: "1:514058614752:web:dddf75f6bb68d3416d9d85"
};

// Initialize Firebase
let app, db;
let isOnline = navigator.onLine;
let isSyncing = false;
let pendingChanges = [];
let lastSyncTime = 0;
let syncInterval = null;

// === Global Variables ===
let products = [];
let cart = [];
let archive = [];
let debts = [];
let lowStockAlerts = [];
let settings = { 
    id: 1, 
    phone: "07700873460", 
    footer: "البضاعة المباعة لا ترد ولا تستبدل إلا بعذر شرعي", 
    darkMode: true 
};

// متغير كلمة السر (سيتم تحميله من Firebase)
let appPassword = "";

// متغيرات جديدة لتخزين معلومات الزبون
let customerName = "";
let customerPhone = "";

let activeCategory = "الكل";
let pendingAction = null; 
let isGlobalUnlocked = false; 
let touchStartX = 0; 
let pressTimer;
let isLongPress = false;
let actionDone = false; 
let startTouchX = 0;
let startTouchY = 0;
let isScrolling = false; 
let lastTouchTime = 0; 
let pendingConfirmAction = null;
let invoiceDiscount = 0;
let salesChart = null;
let isFirstLoad = true;

// === متغيرات لتحسين البحث ===
let searchTimeout = null;
let allProductCards = [];

// === متغير جديد للمؤقت ===
let connectionHideTimer = null;

// === دالة Hashing لتشفير الرقم السري ===
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// === نظام التخزين المحلي ===
const LOCAL_STORAGE_KEYS = {
    PRODUCTS: 'abuhassan_products',
    ARCHIVE: 'abuhassan_archive',
    DEBTS: 'abuhassan_debts',
    SETTINGS: 'abuhassan_settings',
    PASSWORD: 'abuhassan_password',
    CART: 'abuhassan_cart',
    LAST_SYNC: 'abuhassan_last_sync',
    PENDING_CHANGES: 'abuhassan_pending_changes'
};

// === دالة لتحميل البيانات محلياً ===
function loadFromLocalStorage(key, defaultValue = []) {
    try {
        const data = localStorage.getItem(key);
        if (data) {
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('خطأ في تحميل البيانات محلياً:', error);
    }
    return defaultValue;
}

// === دالة لحفظ البيانات محلياً (نسخة نظيفة) ===
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('خطأ في حفظ البيانات محلياً:', error);
        return false;
    }
}

// === دالة لحفظ جميع البيانات محلياً (نسخة نظيفة) ===
function saveAllToLocalStorage() {
    // حفظ كل البيانات ما عدا السلة
    const success = 
        saveToLocalStorage(LOCAL_STORAGE_KEYS.PRODUCTS, products) &&
        saveToLocalStorage(LOCAL_STORAGE_KEYS.ARCHIVE, archive) &&
        saveToLocalStorage(LOCAL_STORAGE_KEYS.DEBTS, debts) &&
        saveToLocalStorage(LOCAL_STORAGE_KEYS.SETTINGS, settings) &&
        saveToLocalStorage(LOCAL_STORAGE_KEYS.PASSWORD, appPassword);
    
    // حفظ وقت المزامنة
    lastSyncTime = Date.now();
    saveToLocalStorage(LOCAL_STORAGE_KEYS.LAST_SYNC, lastSyncTime);
    
    // ضمان مسح السلة دائماً
    try {
        localStorage.removeItem(LOCAL_STORAGE_KEYS.CART);
    } catch (e) { }
    
    return success;
}

// === دالة لتحميل جميع البيانات محلياً ===
function loadAllFromLocalStorage() {
    try {
        products = loadFromLocalStorage(LOCAL_STORAGE_KEYS.PRODUCTS, []);
        archive = loadFromLocalStorage(LOCAL_STORAGE_KEYS.ARCHIVE, []);
        settings = loadFromLocalStorage(LOCAL_STORAGE_KEYS.SETTINGS, { 
            id: 1, 
            phone: "07700873460", 
            footer: "البضاعة المباعة لا ترد ولا تستبدل إلا بعذر شرعي", 
            darkMode: true 
        });
        
        // تحميل الديون مع التأكد من أنها صالحة
        const loadedDebts = loadFromLocalStorage(LOCAL_STORAGE_KEYS.DEBTS, []);
        debts = Array.isArray(loadedDebts) ? loadedDebts : [];
        
        cart = [];
        appPassword = loadFromLocalStorage(LOCAL_STORAGE_KEYS.PASSWORD, "");
        lastSyncTime = loadFromLocalStorage(LOCAL_STORAGE_KEYS.LAST_SYNC, 0);
        pendingChanges = loadFromLocalStorage(LOCAL_STORAGE_KEYS.PENDING_CHANGES, []);

        // إذا كانت المنتجات فارغة، أضف منتجات افتراضية
        if (products.length === 0) {
            products = [
                {id: 1, name: "شيش 12 ملم", price: 15000, cost: 13000, stock: 100, cat: "شيش", code: "A1"},
                {id: 2, name: "زاوية 2 انج", price: 8000, cost: 6000, stock: 50, cat: "زوايا", code: "B1"}
            ];
            saveToLocalStorage(LOCAL_STORAGE_KEYS.PRODUCTS, products);
        }

        return true;
    } catch (error) {
        console.error('خطأ في تحميل البيانات المحلية:', error);
        // إعادة تعيين كل شيء في حالة الخطأ
        products = [];
        archive = [];
        debts = [];
        settings = { 
            id: 1, 
            phone: "07700873460", 
            footer: "البضاعة المباعة لا ترد ولا تستبدل إلا بعذر شرعي", 
            darkMode: true 
        };
        cart = [];
        return false;
    }
}

// دالة لتفريغ القائمة و إعادة تعيين كل شيء عند تحميل الصفحة
function resetCartOnReload() {
    // تفريغ السلة
    cart = [];
    
    // إعادة تعيين الخصم
    invoiceDiscount = 0;
    
    // إعادة تعيين اسم ورقم الزبون
    customerName = "";
    customerPhone = "";
    
    // إعادة تعيين رقم الفاتورة
    document.getElementById('invoiceNum').innerText = Math.floor(Math.random() * 9000) + 1000;
    
    // تحديث واجهة الزبون
    updateCustomerDisplay();
    
    // تحديث واجهة السلة
    updateCartUI();
    
    // تحديث جميع بطاقات المنتجات لتعرض الكمية الكاملة
    allProductCards.forEach(card => {
        updateProductCard(card);
    });
    
    // مسح أي بيانات للسلة في localStorage (للتأكد)
    try {
        localStorage.removeItem(LOCAL_STORAGE_KEYS.CART);
    } catch (e) {
        // تجاهل الخطأ
    }
    
    //console.log("تم إعادة تعيين القائمة بعد تحميل الصفحة");
}

// === إدارة حالة الاتصال ===
function updateConnectionStatus() {
    const connectionStatus = document.getElementById('connectionStatus');
    
    // إلغاء المؤقت السابق إذا كان موجوداً
    if (connectionHideTimer) {
        clearTimeout(connectionHideTimer);
        connectionHideTimer = null;
    }
    
    // إزالة كلاس الإخفاء لجعل الشريط مرئياً
    connectionStatus.classList.remove('hidden');
    
    // تحديث حالة الشريط بناءً على الحالة الحالية
    let statusMessage = '';
    
    if (isOnline) {
        if (isSyncing) {
            connectionStatus.className = 'connection-status syncing';
            statusMessage = 'جاري المزامنة مع السحابة...';
        } else {
            connectionStatus.className = 'connection-status online';
            statusMessage = 'متصل بالسحابة';
        }
    } else {
        connectionStatus.className = 'connection-status offline';
        statusMessage = 'غير متصل - العمل محلياً';
    }
    
    connectionStatus.title = statusMessage;
    
    // فقط أخفِ الشريط إذا لم تكن هناك مزامنة جارية
    // ولا إذا كانت حالة اتصال جديدة (تمت معالجتها في checkConnection)
    if (!isSyncing) {
        connectionHideTimer = setTimeout(() => {
            connectionStatus.classList.add('hidden');
        }, 2000);
    }
}

// دالة لإخفاء شريط الاتصال مباشرة
function hideConnectionStatus() {
    const connectionStatus = document.getElementById('connectionStatus');
    connectionStatus.classList.add('hidden');
    
    // إلغاء أي مؤقتات نشطة
    if (connectionHideTimer) {
        clearTimeout(connectionHideTimer);
        connectionHideTimer = null;
    }
}

// دالة لإظهار شريط الاتصال مؤقتاً
function showConnectionStatusTemporarily(message, type = 'info') {
    const connectionStatus = document.getElementById('connectionStatus');
    
    // إلغاء المؤقت السابق
    if (connectionHideTimer) {
        clearTimeout(connectionHideTimer);
        connectionHideTimer = null;
    }
    
    // إزالة كلاس الإخفاء
    connectionStatus.classList.remove('hidden');
    
    // تعيين النوع واللون
    if (type === 'success') {
        connectionStatus.className = 'connection-status online';
        connectionStatus.title = message;
    } else if (type === 'error') {
        connectionStatus.className = 'connection-status offline';
        connectionStatus.title = message;
    } else if (type === 'syncing') {
        connectionStatus.className = 'connection-status syncing';
        connectionStatus.title = message;
    }
    
    // إعداد مؤقت للإخفاء بعد ثانيتين
    connectionHideTimer = setTimeout(() => {
        connectionStatus.classList.add('hidden');
    }, 2000);
}

// === التحقق من الاتصال ===
function checkConnection() {
    const wasOnline = isOnline;
    isOnline = navigator.onLine;
    
    console.log(`تغير حالة الاتصال: ${wasOnline ? 'متصل' : 'غير متصل'} -> ${isOnline ? 'متصل' : 'غير متصل'}`);
    
    if (isOnline && !wasOnline) {
        // تغير من غير اتصال إلى اتصال
        showToast('تم استعادة الاتصال بالإنترنت', 'success');
        
        // إظهار شريط الاتصال باللون الأخضر أولاً
        showConnectionStatusTemporarily('تم استعادة الاتصال بالإنترنت', 'success');
        
        // انتظر قليلاً ثم ابدأ المزامنة
        setTimeout(() => {
            if (isOnline && !isSyncing) {
                showConnectionStatusTemporarily('جاري مزامنة البيانات مع السحابة...', 'syncing');
                syncAll();
            }
        }, 1500);
        
    } else if (!isOnline && wasOnline) {
        // تغير من اتصال إلى غير اتصال
        showToast('فقد الاتصال بالإنترنت، العمل محلياً', 'warning');
        showConnectionStatusTemporarily('فقد الاتصال بالإنترنت، العمل محلياً', 'error');
    }
}

// === تسجيل التغييرات للدفع ===
function trackChange(type, data) {
    const change = {
        type: type,
        data: data,
        timestamp: Date.now()
    };
    
    pendingChanges.push(change);
    saveToLocalStorage(LOCAL_STORAGE_KEYS.PENDING_CHANGES, pendingChanges);
    
    if (isOnline && !isSyncing) {
        startSync();
    }
}

// === مزامنة التغييرات مع Firebase ===
async function syncChanges() {
    if (!isOnline || isSyncing || pendingChanges.length === 0) return;
    
    isSyncing = true;
    //console.log("بدء مزامنة التغييرات المحلية...");
    
    try {
        showConnectionStatusTemporarily('جاري رفع التغييرات المحلية...', 'syncing', 2000);
        
        // تجميع التغييرات حسب النوع
        const changesByType = {};
        pendingChanges.forEach(change => {
            if (!changesByType[change.type]) {
                changesByType[change.type] = [];
            }
            changesByType[change.type].push(change);
        });

        // تنفيذ المزامنة لكل نوع
        let successCount = 0;
        let errorCount = 0;
        
        for (const [type, changes] of Object.entries(changesByType)) {
            try {
                switch(type) {
                    case 'product_update':
                        await syncProducts();
                        break;
                    case 'archive_update':
                        await syncArchive();
                        break;
                    case 'debt_update':
                        await syncDebts();
                        break;
                    case 'settings_update':
                        await syncSettings();
                        break;
                }
                successCount++;
            } catch (error) {
                errorCount++;
                console.error(`خطأ في مزامنة ${type}:`, error);
            }
        }

        // مسح التغييرات التي تمت مزامنتها بنجاح فقط
        const originalCount = pendingChanges.length;
        pendingChanges = pendingChanges.filter(change => {
            // احتفظ بالتغييرات التي فشلت في المزامنة
            return !changesByType[change.type]?.includes(change) || errorCount > 0;
        });
        
        saveToLocalStorage(LOCAL_STORAGE_KEYS.PENDING_CHANGES, pendingChanges);
        
        lastSyncTime = Date.now();
        saveToLocalStorage(LOCAL_STORAGE_KEYS.LAST_SYNC, lastSyncTime);
        
        if (errorCount === 0) {
            const message = `تمت مزامنة ${originalCount} تغيير`;
            console.log(message);
            showToast(message);
            showConnectionStatusTemporarily('تمت المزامنة بنجاح', 'success');
        } else {
            const message = `تمت مزامنة ${successCount} من ${successCount + errorCount} تغيير`;
            console.warn(message);
            showToast(message, 'warning');
            showConnectionStatusTemporarily('تمت المزامنة جزئياً', 'success');
        }
        
    } catch (error) {
        console.error('خطأ عام في المزامنة:', error);
        showToast('خطأ في المزامنة', 'error');
        showConnectionStatusTemporarily('خطأ في المزامنة', 'error');
    } finally {
        isSyncing = false;
        
        // بعد انتهاء المزامنة، تأكد من أن الشريط يظهر الحالة الصحيحة
        setTimeout(() => {
            if (isOnline && !isSyncing) {
                showConnectionStatusTemporarily('متصل بالسحابة', 'success');
            }
        }, 300);
    }
}

// === دالة لتحميل كلمة السر من Firebase ===
async function loadPasswordFromFirebase() {
    if (!db) {
        console.error("Firebase غير متصل");
        return false;
    }
    
    try {
        const passwordSnapshot = await db.ref('password').once('value');
        const passwordData = passwordSnapshot.val();
        
        if (passwordData && passwordData.hash) {
            appPassword = passwordData.hash;
            saveToLocalStorage(LOCAL_STORAGE_KEYS.PASSWORD, appPassword);
            //console.log("تم تحميل كلمة السر من Firebase");
            return true;
        }
        return false;
    } catch (error) {
        console.error('خطأ في تحميل كلمة السر من Firebase:', error);
        return false;
    }
}

// === دالة لحفظ كلمة السر إلى Firebase ===
async function savePasswordToFirebase(newPassword) {
    if (!db) {
        console.error("Firebase غير متصل");
        return false;
    }
    
    try {
        const newHash = await hashPassword(newPassword);
        
        await db.ref('password').set({
            hash: newHash,
            lastChanged: new Date().toISOString(),
            changedBy: "app"
        });
        
        appPassword = newHash;
        saveToLocalStorage(LOCAL_STORAGE_KEYS.PASSWORD, appPassword);
        //console.log("تم تحديث كلمة السر في Firebase");
        return true;
    } catch (error) {
        console.error('خطأ في حفظ كلمة السر إلى Firebase:', error);
        return false;
    }
}

// === دالة للتحقق من كلمة السر مباشرة من Firebase ===
async function verifyPasswordFromFirebase(inputPassword) {
    if (!db) {
        console.error("Firebase غير متصل");
        return false;
    }
    
    try {
        // إذا كانت كلمة السر محملة بالفعل، استخدمها
        if (appPassword) {
            const inputHash = await hashPassword(inputPassword);
            return inputHash === appPassword;
        }
        
        // وإلا، قم بتحميلها من Firebase مباشرة
        const passwordSnapshot = await db.ref('password').once('value');
        const passwordData = passwordSnapshot.val();
        
        if (passwordData && passwordData.hash) {
            const inputHash = await hashPassword(inputPassword);
            return inputHash === passwordData.hash;
        }
        
        return false;
    } catch (error) {
        console.error('خطأ في التحقق من كلمة السر من Firebase:', error);
        return false;
    }
}

// === مزامنة كل البيانات مع Firebase ===
async function syncAll() {
    if (!isOnline || isSyncing) return;
    
    isSyncing = true;
    //console.log("بدء المزامنة الكاملة...");
    
    try {
        // إظهار شريط المزامنة (أزرق)
        showConnectionStatusTemporarily('جاري الاتصال بالسحابة وجلب البيانات...', 'syncing', 3000);
        
        // تنفيذ المزامنات بشكل متتابع لتجنب الأخطاء
        const results = await Promise.allSettled([
            syncProducts(),
            syncArchive(),
            syncDebts(),
            syncSettings()
        ]);
        
        // التحقق من النتائج
        let successCount = 0;
        let errorCount = 0;
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                successCount++;
                console.log(`المزامنة ${index + 1} تمت بنجاح`);
            } else {
                errorCount++;
                console.error(`المزامنة ${index + 1} فشلت:`, result.reason);
            }
        });
        
        lastSyncTime = Date.now();
        saveToLocalStorage(LOCAL_STORAGE_KEYS.LAST_SYNC, lastSyncTime);
        
        if (errorCount === 0) {
            // كل شيء ناجح
            //console.log("تمت مزامنة جميع البيانات مع Firebase بنجاح");
            showToast("تمت المزامنة الكاملة بنجاح");
            showConnectionStatusTemporarily('تمت المزامنة بنجاح', 'success');
        } else if (successCount > 0) {
            // نجاح جزئي
            console.log(`تمت مزامنة ${successCount} من ${results.length} بنجاح`);
            showToast(`تمت المزامنة جزئياً (${successCount}/${results.length})`, 'warning');
            showConnectionStatusTemporarily('تمت المزامنة جزئياً', 'success');
        } else {
            // فشل كامل
            console.error("فشلت جميع عمليات المزامنة");
            showToast("فشلت المزامنة", 'error');
            showConnectionStatusTemporarily('فشلت المزامنة', 'error');
        }
        
        return errorCount === 0;
    } catch (error) {
        console.error('خطأ في مزامنة البيانات:', error);
        showToast('خطأ في المزامنة', 'error');
        showConnectionStatusTemporarily('خطأ في المزامنة', 'error');
        return false;
    } finally {
        isSyncing = false;
        console.log("انتهت المزامنة، حالة الاتصال:", isOnline ? "متصل" : "غير متصل");
        
        // تأكد من أن الشريط يظهر الحالة الصحيحة بعد المزامنة
        setTimeout(() => {
            if (isOnline && !isSyncing) {
                showConnectionStatusTemporarily('متصل بالسحابة', 'success');
            }
        }, 500);
    }
}

// === مزامنة المنتجات ===
async function syncProducts() {
    if (!db) return;
    
    try {
        // جلب البيانات من Firebase
        const firebaseSnapshot = await db.ref('products').once('value');
        const firebaseProducts = firebaseSnapshot.val() || [];
        
        // مقارنة مع البيانات المحلية
        if (firebaseProducts.length > 0) {
            // دمج البيانات (الأحدث يفوز)
            const mergedProducts = [...products];
            const localProductMap = new Map(products.map(p => [p.id, p]));
            
            firebaseProducts.forEach(fbProduct => {
                const localProduct = localProductMap.get(fbProduct.id);
                if (!localProduct || fbProduct.lastModified > (localProduct.lastModified || 0)) {
                    // تحديث المنتج من Firebase
                    const index = mergedProducts.findIndex(p => p.id === fbProduct.id);
                    if (index !== -1) {
                        mergedProducts[index] = fbProduct;
                    } else {
                        mergedProducts.push(fbProduct);
                    }
                }
            });
            
            // حفظ البيانات المدمجة
            products = mergedProducts;
            saveToLocalStorage(LOCAL_STORAGE_KEYS.PRODUCTS, products);
            
            // تحديث العرض
            renderCategories();
            allProductCards = [];
            filterProducts();
            
            // تحديث Firebase بالبيانات المحلية الجديدة
            await db.ref('products').set(products);
        } else {
            // إذا كانت Firebase فارغة، حفظ البيانات المحلية
            await db.ref('products').set(products);
        }
        
        return true;
    } catch (error) {
        console.error('خطأ في مزامنة المنتجات:', error);
        return false;
    }
}

// === مزامنة الأرشيف ===
async function syncArchive() {
    if (!db) return;
    
    try {
        const firebaseSnapshot = await db.ref('archive').once('value');
        const firebaseArchive = firebaseSnapshot.val() || [];
        
        // دمج الأرشيف (الأحدث أولاً)
        const mergedArchive = [...archive];
        const localArchiveMap = new Map(archive.map(a => [a.id, a]));
        
        firebaseArchive.forEach(fbArchive => {
            if (!localArchiveMap.has(fbArchive.id)) {
                mergedArchive.push(fbArchive);
            }
        });
        
        // ترتيب حسب التاريخ (الأحدث أولاً)
        mergedArchive.sort((a, b) => {
            const dateA = new Date(a.date || 0);
            const dateB = new Date(b.date || 0);
            return dateB - dateA;
        });
        
        // حفظ الملفات الأخيرة فقط (100 ملف)
        if (mergedArchive.length > 100) {
            mergedArchive.splice(100);
        }
        
        archive = mergedArchive;
        saveToLocalStorage(LOCAL_STORAGE_KEYS.ARCHIVE, archive);
        
        await db.ref('archive').set(archive);
        return true;
    } catch (error) {
        console.error('خطأ في مزامنة الأرشيف:', error);
        return false;
    }
}

// === مزامنة الديون ===
async function syncDebts() {
    if (!db) return;
    
    try {
        const firebaseSnapshot = await db.ref('debts').once('value');
        const firebaseDebts = firebaseSnapshot.val() || [];
        
        // إذا كانت الديون المحلية فارغة وكانت في Firebase فارغة أيضاً، لا داعي للدمج
        if (debts.length === 0 && firebaseDebts.length === 0) {
            console.log("لا توجد ديون لمزامنتها");
            return true;
        }
        
        // إذا كانت الديون المحلية فارغة، ولكن Firebase بها ديون، نحتاج إلى حذفها
        if (debts.length === 0 && firebaseDebts.length > 0) {
            console.log("حذف الديون المتبقية في Firebase");
            await db.ref('debts').remove();
            return true;
        }
        
        // إذا كانت الديون المحلية بها بيانات، نقوم بالدمج العادي
        const mergedDebts = [...debts];
        const localDebtMap = new Map(debts.map(d => [d.id, d]));
        
        // دمج فقط الديون الجديدة من Firebase
        firebaseDebts.forEach(fbDebt => {
            if (!localDebtMap.has(fbDebt.id)) {
                mergedDebts.push(fbDebt);
            }
        });
        
        // تحديث الديون المحلية
        debts = mergedDebts;
        saveToLocalStorage(LOCAL_STORAGE_KEYS.DEBTS, debts);
        
        // رفع الديون المدمجة إلى Firebase
        await db.ref('debts').set(debts);
        //console.log("تمت مزامنة الديون مع Firebase");
        return true;
    } catch (error) {
        console.error('خطأ في مزامنة الديون:', error);
        return false;
    }
}

// === مزامنة الإعدادات ===
async function syncSettings() {
    if (!db) return;
    
    try {
        const firebaseSnapshot = await db.ref('settings').once('value');
        const firebaseSettings = firebaseSnapshot.val();
        
        if (firebaseSettings) {
            // دمج الإعدادات (الأحدث يفوز)
            if (firebaseSettings.lastModified > (settings.lastModified || 0)) {
                settings = firebaseSettings;
                saveToLocalStorage(LOCAL_STORAGE_KEYS.SETTINGS, settings);
                
                // تطبيق الإعدادات
                document.body.className = settings.darkMode ? 'dark-mode' : 'light-mode';
                document.getElementById('darkModeToggle').innerText = settings.darkMode ? '☀️' : '🌙';
                document.getElementById('phoneDisplay').innerText = settings.phone;
                document.getElementById('invFooterText').innerText = settings.footer;
            } else {
                await db.ref('settings').set(settings);
            }
        } else {
            await db.ref('settings').set(settings);
        }
        
        return true;
    } catch (error) {
        console.error('خطأ في مزامنة الإعدادات:', error);
        return false;
    }
}

// === بدء المزامنة ===
function startSync() {
    if (isOnline && !isSyncing) {
        // إظهار حالة المزامنة
        showConnectionStatusTemporarily('جاري مزامنة البيانات مع السحابة...', 'syncing');
        syncChanges();
    }
}

// === إعداد Firebase ===
async function setupFirebase() {
    try {
        // محاولة تهيئة Firebase بسرعة أكبر
        const initStartTime = Date.now();
        
        app = firebase.initializeApp(firebaseConfig);
        db = firebase.database();
        
        console.log(`تم الاتصال بـ Firebase بنجاح خلال ${Date.now() - initStartTime}ms`);
        
        // إعداد الاستماع للتغييرات في الوقت الحقيقي
        setupRealtimeListeners();
        
        // محاولة تحميل كلمة السر
        if (isOnline) {
            try {
                // استخدام Promise مع مهلة قصيرة
                const passwordPromise = loadPasswordFromFirebase();
                const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(false), 2000));
                
                const passwordLoaded = await Promise.race([passwordPromise, timeoutPromise]);
                
                if (passwordLoaded) {
                    console.log("تم تحميل كلمة السر بسرعة");
                }
            } catch (error) {
                console.log("خطأ بسيط في تحميل كلمة السر، سيتم استخدام المحلية:", error);
            }
        }
        
        // بدء المزامنة التلقائية بشكل غير متزامن
        setTimeout(async () => {
            if (isOnline && !isSyncing) {
                await syncAll();
                // بعد اكتمال المزامنة، تحقق من الحالة
                showConnectionStatusTemporarily('متصل بالسحابة وجاهز للعمل', 'success');
            }
        }, 1000);
        
        return true;
    } catch (error) {
        console.error("خطأ في الاتصال بـ Firebase:", error);
        return false;
    }
}

// === PWA Initialization ===
function initPWA() {
    const manifest = { 
        "name": "أبو حسن للحديد", 
        "short_name": "أبو حسن", 
        "start_url": ".", 
        "display": "standalone", 
        "background_color": "#1e272e", 
        "theme_color": "#1e272e", 
        "icons": [ 
            { 
                "src": "https://cdn-icons-png.flaticon.com/512/2554/2554039.png", 
                "sizes": "192x192", 
                "type": "image/png" 
            } 
        ] 
    };
    const blob = new Blob([JSON.stringify(manifest)], {type: 'application/json'});
    document.querySelector('#my-manifest-placeholder').setAttribute('href', URL.createObjectURL(blob));
}

// === Customer Display Functions ===
function updateCustomerDisplay() {
    const nameDisplay = document.getElementById('customerNameDisplay');
    const phoneDisplay = document.getElementById('customerPhoneDisplay');
    
    if (customerName && customerName.trim() !== "") {
        nameDisplay.textContent = customerName;
        nameDisplay.className = "customer-info-value";
    } else {
        nameDisplay.textContent = "انقر للإضافة";
        nameDisplay.className = "customer-info-value empty";
    }
    
    if (customerPhone && customerPhone.trim() !== "") {
        phoneDisplay.textContent = customerPhone;
        phoneDisplay.className = "customer-info-value";
    } else {
        phoneDisplay.textContent = "انقر للإضافة";
        phoneDisplay.className = "customer-info-value empty";
    }
}

function openEditCustomerName() {
    showModal('اسم الزبون', `
        <input type="text" id="editCustomerNameInput" class="modal-input" placeholder="اسم الزبون" value="${customerName}">
        <div style="display:flex; gap:10px; margin-top:15px;">
            <button class="btn btn-print" style="flex:1" onclick="saveCustomerName()">حفظ</button>
            <button class="btn btn-delete" style="flex:1" onclick="clearCustomerName()">مسح</button>
        </div>
    `);
}

function saveCustomerName() {
    const newName = document.getElementById('editCustomerNameInput').value.trim();
    customerName = newName;
    updateCustomerDisplay();
    closeModal();
}

function clearCustomerName() {
    customerName = "";
    updateCustomerDisplay();
    closeModal();
}

function openEditCustomerPhone() {
    showModal('رقم هاتف الزبون', `
        <input type="tel" id="editCustomerPhoneInput" class="modal-input" placeholder="رقم الهاتف" value="${customerPhone}">
        <div style="display:flex; gap:10px; margin-top:15px;">
            <button class="btn btn-print" style="flex:1" onclick="saveCustomerPhone()">حفظ</button>
            <button class="btn btn-delete" style="flex:1" onclick="clearCustomerPhone()">مسح</button>
        </div>
    `);
}

function saveCustomerPhone() {
    const newPhone = document.getElementById('editCustomerPhoneInput').value.trim();
    customerPhone = newPhone;
    updateCustomerDisplay();
    closeModal();
}

function clearCustomerPhone() {
    customerPhone = "";
    updateCustomerDisplay();
    closeModal();
}

// === Dark Mode Toggle ===
function toggleDarkMode() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    if (isDarkMode) {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
        document.getElementById('darkModeToggle').innerText = '🌙';
        settings.darkMode = false;
    } else {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').innerText = '☀️';
        settings.darkMode = true;
    }
    saveAllToLocalStorage();
    trackChange('settings_update', settings);
    
    // Update chart if exists
    if (salesChart) {
        initSalesChart();
    }
}

// === Low Stock Alerts ===
async function checkLowStock() {
    try {
        const lowStockProducts = products.filter(p => p.stock <= 5);
        const bellBtn = document.getElementById('bellBtn');
        const bellBadge = document.getElementById('bellBadge');
        
        if (lowStockProducts.length > 0) {
            bellBtn.classList.add('bell-alert');
            bellBadge.textContent = lowStockProducts.length;
            bellBadge.style.display = 'flex';
            
            lowStockAlerts = lowStockProducts.map(prod => ({
                productId: prod.id,
                productName: prod.name,
                currentStock: prod.stock,
                alertDate: new Date().toLocaleString()
            }));
        } else {
            bellBtn.classList.remove('bell-alert');
            bellBadge.style.display = 'none';
            lowStockAlerts = [];
        }
    } catch (error) {
        console.error('Error checking low stock:', error);
    }
}

function showLowStockAlerts() {
    if (lowStockAlerts.length === 0) {
        showToast('لا توجد مواد منخفضة المخزون أو نفذت كلياً');
        return;
    }
    
    let alertHTML = '<h4 style="color:var(--yellow); margin-bottom:10px;">مواد مخزونها منخفض أو نفذت:</h4>';
    alertHTML += '<div style="max-height:200px; overflow-y:auto;">';
    
    lowStockAlerts.forEach(alert => {
        const stockColor = alert.currentStock === 0 ? 'var(--red)' : (alert.currentStock <= 2 ? 'var(--yellow)' : 'var(--green)');
        alertHTML += `
            <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #444;">
                <span>${alert.productName}</span>
                <span style="color:${stockColor}; font-weight:bold;">
                    ${alert.currentStock === 0 ? 'نفذت' : `${alert.currentStock} قطع`}
                </span>
            </div>
        `;
    });
    
    alertHTML += '</div>';
    
    showModal('تنبيهات المخزون المنخفض أو النفاذ', alertHTML);
}

// === Sales Chart ===
function initSalesChart() {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;
    
    if (salesChart) {
        try {
            salesChart.destroy();
        } catch (e) {
            console.log('Error destroying previous chart:', e);
        }
    }
    
    const last7Days = [];
    const salesData = [];
    
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = formatDate(date);
        last7Days.push(dateStr);
        
        let daySales = 0;
        for (const a of archive) {
            try {
                if (a.date && isSameDay(new Date(a.date), date)) {
                    daySales += a.total || 0;
                }
            } catch (e) {
                console.log('Error processing archive item:', e);
            }
        }
        
        salesData.push(daySales);
    }
    
    const isDarkMode = document.body.classList.contains('dark-mode');
    const bgColor = isDarkMode ? '#2d3436' : '#ffffff';
    const textColor = isDarkMode ? '#dfe6e9' : '#333333';
    const gridColor = isDarkMode ? '#4d5861' : '#e0e0e0';
    const pointColor = isDarkMode ? '#e17055' : '#e17055';
    const lineColor = isDarkMode ? '#00b894' : '#00b894';
    
    try {
        salesChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days,
                datasets: [{
                    label: 'المبيعات',
                    data: salesData,
                    borderColor: lineColor,
                    backgroundColor: `${lineColor}20`,
                    pointBackgroundColor: pointColor,
                    pointBorderColor: bgColor,
                    pointBorderWidth: 2,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: textColor,
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            color: gridColor
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: textColor,
                            callback: function(value) {
                                if (value >= 1000) {
                                    return (value/1000).toFixed(0) + 'K';
                                }
                                return value;
                            }
                        },
                        grid: {
                            color: gridColor
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating chart:', error);
    }
}

// === دالة مساعدة لمقارنة التواريخ ===
function formatDate(date) {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    return `${day}/${month}`;
}

function isSameDay(date1, date2) {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
}

function getTodayDateString() {
    const today = new Date();
    return `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
}

// === دالة Debounce لتحسين البحث ===
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// تنظيف السلة والمؤقتات عند إغلاق الصفحة
window.addEventListener('beforeunload', function() {
    // 1. تفريغ السلة من الذاكرة
    cart = [];
    try {
        localStorage.removeItem(LOCAL_STORAGE_KEYS.CART);
    } catch (error) { /* تجاهل */ }

    // 2. تنظيف مؤقت شريط الاتصال
    if (connectionHideTimer) {
        clearTimeout(connectionHideTimer);
    }
});

// === Initialize App ===
window.onload = async function() {
    initPWA();
    
    try {
        // 1. تحميل البيانات المحلية أولاً (سريع جداً)
        loadAllFromLocalStorage();
        
        // 2. تحديث الواجهة بالبيانات المحلية
        updateUIFromLocalData();
        
        // 3. تفريغ القائمة و إعادة تعيين كل شيء ← أضفنا هذا السطر
        resetCartOnReload();
        
        // 4. التحقق من الاتصال وتهيئة Firebase بشكل أسرع
        updateConnectionStatus();
        
        // تحسين: تشغيل التهيئة بشكل متوازي
        const initPromises = [];
        
        if (isOnline) {
            initPromises.push(setupFirebase().then(connected => {
                if (!connected) {
                    showToast("غير قادر على الاتصال بالسحابة. العمل بالبيانات المحلية", "warning");
                }
            }));
        } else {
            showToast("غير متصل بالإنترنت. العمل بالبيانات المحلية", "warning");
        }
        
        // انتظار اكتمال جميع العمليات
        await Promise.allSettled(initPromises);
        
        // 5. إعداد مستمعي الأحداث
        setupEventListeners();
        
        // 6. فحص المخزون المنخفض
        await checkLowStock();
        
        // 7. إعداد المزامنة التلقائية
        setupAutoSync();
        
        showToast("التطبيق جاهز للاستخدام" + (isOnline ? " - متصل بالسحابة" : " - العمل محلياً"));
        
        // إخفاء شريط الاتصال بعد ثانيتين من التحميل
        setTimeout(() => {
            hideConnectionStatus();
        }, 2000);
        
    } catch (error) {
        console.error('Initialization error:', error);
        showToast('حدث خطأ في تهيئة التطبيق. الرجاء تحديث الصفحة', 'error');
    }
};

// === دالة لتحديث الواجهة بالبيانات المحلية ===
function updateUIFromLocalData() {
    // تطبيق الإعدادات
    document.body.className = settings.darkMode ? 'dark-mode' : 'light-mode';
    document.getElementById('darkModeToggle').innerText = settings.darkMode ? '☀️' : '🌙';
    document.getElementById('phoneDisplay').innerText = settings.phone;
    document.getElementById('invFooterText').innerText = settings.footer;

    // تأكيد أن السلة فارغة عند التحميل ← أضفنا هذا
    cart = [];
    invoiceDiscount = 0;
    customerName = "";
    customerPhone = "";
    
    // تحديث العرض
    document.getElementById('invoiceNum').innerText = Math.floor(Math.random()*9000)+1000;
    updateCustomerDisplay();
    updateTime(); 
    setInterval(updateTime, 1000);
    
    updateCartUI();
    renderCategories();
    allProductCards = [];
    filterProducts();
}

// === إعداد مستمعي الأحداث ===
function setupEventListeners() {
    // مستمعي اللمس
    const content = document.getElementById('mainContent');
    content.addEventListener('touchstart', e => { 
        touchStartX = e.changedTouches[0].screenX; 
    }, {passive: true});
    content.addEventListener('touchend', e => { 
        handleSwipe(e.changedTouches[0].screenX); 
    }, {passive: true});
    
    // مستمعي الاتصال
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', checkConnection);
    
    // زر الرجوع
    setupBackButtonHandler();
}

// === إعداد المزامنة التلقائية ===
function setupAutoSync() {
    // مزامنة كل 30 ثانية إذا كان هناك اتصال
    syncInterval = setInterval(() => {
        if (isOnline && !isSyncing && pendingChanges.length > 0) {
            startSync();
        }
    }, 30000);
}

// === إعداد الاستماع للتغييرات في الوقت الحقيقي ===
function setupRealtimeListeners() {
    if (!db) return;

    // الاستماع للتغييرات في كلمة السر
    db.ref('password').on('value', (snapshot) => {
        const passwordData = snapshot.val();
        if (passwordData && passwordData.hash) {
            appPassword = passwordData.hash;
            saveToLocalStorage(LOCAL_STORAGE_KEYS.PASSWORD, appPassword);
            //console.log("تم تحديث كلمة السر من Firebase في الوقت الحقيقي");
        }
    });

    // الاستماع للتغييرات في المنتجات
    db.ref('products').on('value', (snapshot) => {
        const firebaseProducts = snapshot.val() || [];
        if (firebaseProducts.length > 0) {
            // تحديث البيانات المحلية
            products = firebaseProducts;
            saveToLocalStorage(LOCAL_STORAGE_KEYS.PRODUCTS, products);
            
            // تحديث الواجهة
            renderCategories();
            allProductCards = [];
            filterProducts();
            checkLowStock();
            
            showToast("تم تحديث قائمة المنتجات من السحابة", "success");
        }
    });

    // الاستماع للتغييرات في الأرشيف
    db.ref('archive').on('value', (snapshot) => {
        const firebaseArchive = snapshot.val() || [];
        if (firebaseArchive.length > 0) {
            archive = firebaseArchive;
            saveToLocalStorage(LOCAL_STORAGE_KEYS.ARCHIVE, archive);
        }
    });

    // الاستماع للتغييرات في الديون
    db.ref('debts').on('value', (snapshot) => {
        const firebaseDebts = snapshot.val() || [];
        if (firebaseDebts.length > 0) {
            debts = firebaseDebts;
            saveToLocalStorage(LOCAL_STORAGE_KEYS.DEBTS, debts);
        }
    });

    // الاستماع للتغييرات في الإعدادات
    db.ref('settings').on('value', (snapshot) => {
        const newSettings = snapshot.val();
        if (newSettings) {
            settings = newSettings;
            saveToLocalStorage(LOCAL_STORAGE_KEYS.SETTINGS, settings);
            
            // تحديث الوضع الليلي إذا تغير
            document.body.className = settings.darkMode ? 'dark-mode' : 'light-mode';
            document.getElementById('darkModeToggle').innerText = settings.darkMode ? '☀️' : '🌙';
            document.getElementById('phoneDisplay').innerText = settings.phone;
            document.getElementById('invFooterText').innerText = settings.footer;
        }
    });

    // الاستماع للتغييرات في الديون في الوقت الحقيقي
    db.ref('debts').on('value', (snapshot) => {
        const firebaseDebts = snapshot.val() || [];
        
        // إذا كانت الديون في Firebase فارغة، تأكد من أن المحلية فارغة أيضاً
        if (firebaseDebts.length === 0 && debts.length > 0) {
            //console.log("Firebase يشير إلى عدم وجود ديون، جاري مسح الديون المحلية");
            debts = [];
            saveToLocalStorage(LOCAL_STORAGE_KEYS.DEBTS, debts);
            
            // تحديث الواجهة إذا كنا في قسم الديون
            if (document.getElementById('debtSection').style.display !== 'none') {
                renderDebts();
            }
        }
    });
}

// === دالة البحث المحسنة باستخدام Debounce ===
const debouncedFilterProducts = debounce(filterProducts, 300);

// === إعداد معالج زر الرجوع ===
function setupBackButtonHandler() {
    window.addEventListener('popstate', function(event) {
        handleBackButton();
    });
    
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            handleBackButton();
        }
    });
}

function handleBackButton() {
    if (document.getElementById('mainModal').style.display === 'flex') {
        closeModal();
        return;
    }
    
    if (document.getElementById('confirmModal').style.display === 'flex') {
        closeConfirm();
        return;
    }
    
    const currentTab = ['store','cart','debt','archive','stats'].find(t => 
        document.getElementById(t+'Section').style.display !== 'none');
    
    if (currentTab && currentTab !== 'store') {
        switchTab('store');
    }
}

function updateTime() { 
    document.getElementById('invoiceDate').innerText = new Date().toLocaleString('ar-IQ'); 
}

function showToast(msg, type = 'info') {
    const box = document.getElementById('toastBox');
    const div = document.createElement('div');
    div.className = 'toast'; 
    div.innerText = msg;
    
    // إضافة كلاس للنوع (سيتم التعامل مع الألوان تلقائياً عبر CSS)
    if (type === 'error') {
        div.classList.add('error');
    } else if (type === 'success') {
        div.classList.add('success');
    } else if (type === 'warning') {
        div.classList.add('warning');
    }
    
    box.appendChild(div); 
    setTimeout(() => div.remove(), 3000);
}

function handleSwipe(endX) {
    const diff = endX - touchStartX;
    if (Math.abs(diff) < 50) return; 
    const tabs = ['store', 'cart', 'debt', 'archive', 'stats'];
    let currentIdx = tabs.findIndex(t => document.getElementById(t+'Section').style.display !== 'none');
    if(currentIdx === -1) return;
    if (diff > 0) { 
        if (currentIdx < 4) {
            const target = tabs[currentIdx + 1];
            if(target === 'debt' || target === 'archive' || target === 'stats') secureAccess(()=>switchTab(target)); 
            else switchTab(target);
        }
    } else { 
         if (currentIdx > 0) { 
            const target = tabs[currentIdx - 1];
            if(target === 'debt' || target === 'archive' || target === 'stats') secureAccess(()=>switchTab(target)); 
            else switchTab(target);
        }
    }
}

function setInvoiceStyle(styleName, btnElement) {
    const box = document.getElementById('invoiceToSave');
    box.classList.remove('style-formal', 'style-thermal', 'style-simple');
    box.classList.add('style-' + styleName);
    document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
    if(navigator.vibrate) navigator.vibrate(20);
}

function toggleSearchBox() { 
    document.getElementById('storeFilters').classList.toggle('show'); 
}

function switchTab(t) {
    ['store','cart','debt','archive','stats'].forEach(x => document.getElementById(x+'Section').style.display = 'none');
    document.getElementById(t+'Section').style.display = 'block';
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const nav = document.getElementById('tab-'+t); 
    if(nav) nav.classList.add('active');
    const searchBtn = document.getElementById('searchToggleBtn');
    const filters = document.getElementById('storeFilters');
    if (t === 'store') searchBtn.style.display = 'flex';
    else { 
        searchBtn.style.display = 'none'; 
        filters.classList.remove('show'); 
    }
    
    if(t === 'debt') renderDebts();
    
    if(t === 'archive') {
        const list = document.getElementById('archiveList');
        list.innerHTML = archive.map(a => `
            <div class="product-card" style="text-align:right; margin-bottom:10px; cursor:pointer;" onclick="openArchiveDetails('${a.id}')">
                <div style="display:flex; justify-content:space-between; color:#aaa; font-size:0.8rem">
                    <span>${a.date}</span>
                    <span>${a.type==='credit'?'دين 📒':(a.type==='partial'?'جزء 🌓':'نقد 💵')}</span>
                </div>
                <h4 style="margin:5px 0">رقم: ${a.id} | ${a.customer||'زبون نقدي'}</h4>
                <div style="font-weight:bold; color:var(--accent)">${a.total.toLocaleString()} د.ع</div>
            </div>
        `).join('') || '<p style="text-align:center">لا يوجد سجل</p>';
    }
    
    if(t === 'stats') {
        openStats();
    }
}

function openEditCartItemPrice(idx) {
    const item = cart[idx];
    showModal(`تعديل سعر: ${item.name}`, `
        <p>السعر الحالي: ${item.price.toLocaleString()}</p>
        <input type="number" id="newPriceInput" class="modal-input" placeholder="السعر الجديد" value="${item.price}">
        <button class="btn btn-print" style="width:100%;" onclick="saveCartItemPrice(${idx})">حفظ السعر</button>
    `);
}

function saveCartItemPrice(idx) {
    const newPrice = parseInt(document.getElementById('newPriceInput').value);
    if(newPrice >= 0) {
        cart[idx].price = newPrice;
        updateCartUI();
        closeModal();
        saveAllToLocalStorage();
    }
}

function openDiscountModal() {
    if(cart.length === 0) return showToast('الفاتورة فارغة');
    let total = cart.reduce((a, b) => a + (b.price * b.qty), 0);
    showModal('خصم / تعديل المجموع', `
        <p>المجموع الحالي: ${total.toLocaleString()}</p>
        <div style="display:flex; gap:5px; margin-bottom:10px;">
            <button id="btnDiscAmount" class="btn btn-print" style="flex:1" onclick="switchDiscMode('amount')">خصم مبلغ</button>
            <button id="btnDiscTotal" class="btn btn-image" style="flex:1; opacity:0.5" onclick="switchDiscMode('total')">تحديد الإجمالي</button>
        </div>
        <input type="hidden" id="discType" value="amount">
        <input type="number" id="discInput" class="modal-input" placeholder="المبلغ" inputmode="numeric">
        <button class="btn btn-add" style="width:100%;" onclick="applyDiscount(${total})">تطبيق</button>
    `);
}

function switchDiscMode(mode) {
    const btnAmount = document.getElementById('btnDiscAmount');
    const btnTotal = document.getElementById('btnDiscTotal');
    const hiddenInput = document.getElementById('discType');
    hiddenInput.value = mode;
    if (mode === 'amount') { 
        btnAmount.style.opacity = '1'; 
        btnTotal.style.opacity = '0.5'; 
    } else { 
        btnAmount.style.opacity = '0.5'; 
        btnTotal.style.opacity = '1'; 
    }
}

function applyDiscount(currentTotal) {
    const type = document.getElementById('discType').value;
    const val = parseInt(document.getElementById('discInput').value);
    if(!val || val < 0) return;
    if(type === 'amount') { 
        invoiceDiscount = val; 
    } else { 
        if(val > currentTotal) return showToast('المبلغ أكبر من المجموع!'); 
        invoiceDiscount = currentTotal - val; 
    }
    updateCartUI(); 
    closeModal();
}

function updateCartUI() {
    const tbody = document.getElementById('cartItems');
    tbody.innerHTML = '';
    let subTotal = 0;
    cart.forEach((item, idx) => {
        const rowTotal = item.price * item.qty;
        subTotal += rowTotal;
        tbody.innerHTML += `
            <tr>
                <td style="text-align:right">${item.name}</td>
                <td>${item.qty}</td>
                <td class="editable-price" onclick="openEditCartItemPrice(${idx})">${item.price.toLocaleString()}</td>
                <td>${rowTotal.toLocaleString()}</td>
                <td><button class="btn btn-delete" style="padding:5px 10px; font-size:0.8rem;" ontouchstart="handleTouchStart(event, 'delete', ${idx})" ontouchmove="handleTouchMove(event)" ontouchend="handleTouchEnd(event, 'delete', ${idx})" onmousedown="handleTouchStart(event, 'delete', ${idx})" onmouseup="handleTouchEnd(event, 'delete', ${idx})" onmouseleave="clearTimeout(pressTimer)">✕</button></td>
            </tr>
        `;
    });

    if(invoiceDiscount > subTotal) invoiceDiscount = subTotal;
    const finalTotal = subTotal - invoiceDiscount;

    let totalHtml = `المجموع: ${finalTotal.toLocaleString()} د.ع`;
    if(invoiceDiscount > 0) {
        totalHtml = `<span style="font-size:0.8rem; color:#666; text-decoration:line-through;">${subTotal.toLocaleString()}</span><br>
                     <span style="font-size:0.9rem; color:var(--red);">خصم: ${invoiceDiscount.toLocaleString()}-</span><br>
                     <span style="font-size:1.1rem;">الصافي: ${finalTotal.toLocaleString()} د.ع</span>`;
    }
    document.getElementById('invoiceCalculations').innerHTML = totalHtml;
    document.getElementById('cartBadge').innerText = cart.length;
}

function handleTouchStart(e, type, idOrIdx) {
    lastTouchTime = new Date().getTime();
    if (e.touches && e.touches.length > 0) { 
        startTouchX = e.touches[0].clientX; 
        startTouchY = e.touches[0].clientY; 
    } else { 
        if (new Date().getTime() - lastTouchTime < 500) return; 
        startTouchX = e.clientX; 
        startTouchY = e.clientY; 
    }
    isScrolling = false; 
    isLongPress = false; 
    actionDone = false;
    pressTimer = setTimeout(() => { 
        if (!isScrolling) { 
            isLongPress = true; 
            actionDone = true; 
            if(type === 'delete') remAllItem(idOrIdx); 
            if(type === 'add') openQtyModal(idOrIdx); 
        } 
    }, 600);
}

function handleTouchMove(e) {
    let moveX, moveY;
    if (e.touches && e.touches.length > 0) { 
        moveX = e.touches[0].clientX; 
        moveY = e.touches[0].clientY; 
    } else { 
        moveX = e.clientX; 
        moveY = e.clientY; 
    }
    if (Math.abs(moveX - startTouchX) > 10 || Math.abs(moveY - startTouchY) > 10) { 
        isScrolling = true; 
        clearTimeout(pressTimer); 
    }
}

function handleTouchEnd(e, type, idOrIdx) {
    clearTimeout(pressTimer);
    if (e.type === 'touchend' && e.cancelable) e.preventDefault(); 
    else if (new Date().getTime() - lastTouchTime < 500) return;
    if (!isScrolling && !isLongPress && !actionDone) { 
        actionDone = true; 
        if(type === 'delete') remItem(idOrIdx); 
        if(type === 'add') addToCart(idOrIdx, 1); 
    }
}

function showConfirm(msg, action) {
    document.getElementById('confirmMessage').innerText = msg;
    pendingConfirmAction = action;
    document.getElementById('confirmModal').style.display = 'flex';
    document.getElementById('btnConfirmYes').onclick = function() { 
        if(pendingConfirmAction) pendingConfirmAction(); 
        closeConfirm(); 
    };
}

function closeConfirm() { 
    document.getElementById('confirmModal').style.display = 'none'; 
    pendingConfirmAction = null; 
}

function closeConfirmOnOverlay(event) {
    if (event.target.id === 'confirmModal') {
        closeConfirm();
    }
}

async function clearArchive() { 
    showConfirm('هل أنت متأكد من حذف السجل والإحصائيات بالكامل؟', async () => { 
        archive = []; 
        saveAllToLocalStorage();
        trackChange('archive_update', archive);
        switchTab('archive'); 
        showToast('تم الحذف'); 
    }); 
}

async function clearDebts() { 
    showConfirm('هل أنت متأكد من حذف كل سجل الديون نهائياً من الموقع والسحابة؟', async () => { 
        try {
            // 1. حذف محلي
            debts = []; 
            saveAllToLocalStorage();
            
            // 2. حذف مباشر من Firebase إذا كان متصلاً
            if (isOnline && db) {
                try {
                    await db.ref('debts').remove(); // هذا هو السطر الحاسم!
                    //console.log("تم حذف الديون من Firebase بنجاح");
                    showToast('تم حذف جميع الديون نهائياً من السحابة', 'success');
                } catch (firebaseError) {
                    console.error('خطأ في حذف الديون من Firebase:', firebaseError);
                    
                    // 3. تسجيل التغيير للمزامنة لاحقاً
                    trackChange('debt_update', debts);
                    showToast('تم حذف الديون محلياً، جاري محاولة المزامنة لاحقاً', 'warning');
                }
            } else {
                // 4. إذا كان غير متصل، تسجيل التغيير للمزامنة عند الاتصال
                trackChange('debt_update', debts);
                showToast('تم حذف الديون محلياً، سيتم حذفها من السحابة عند الاتصال', 'warning');
            }
            
            // 5. تحديث الواجهة
            renderDebts(); 
            
            // 6. تحديث الإحصائيات
            if (document.getElementById('statsSection').style.display !== 'none') {
                openStats();
            }
            
        } catch (error) {
            console.error('خطأ عام في حذف الديون:', error);
            showToast('حدث خطأ في حذف الديون', 'error');
        }
    }); 
}

async function remAllItem(idx) { 
    if(navigator.vibrate) navigator.vibrate(50); 
    
    const item = cart[idx];
    const productId = item.id;
    
    cart.splice(idx, 1); 
    updateCartUI(); 
    saveAllToLocalStorage();
    updateProductCardById(productId);
}

function remItem(idx) { 
    if(cart[idx].qty > 1) { 
        cart[idx].qty--; 
        updateCartUI(); 
        saveAllToLocalStorage();
        updateProductCardById(cart[idx].id);
    } else { 
        const removedItem = cart[idx];
        cart.splice(idx, 1);
        updateCartUI();
        saveAllToLocalStorage();
        updateProductCardById(removedItem.id);
    } 
}

function openQtyModal(id) {
    if(navigator.vibrate) navigator.vibrate(50);
    const p = products.find(x => x.id === id);
    const inCart = cart.find(x => x.id === id)?.qty || 0;
    const max = p.stock - inCart;
    if(max <= 0) return showToast('الكمية نافذة');
    showModal(`إضافة كمية: ${p.name}`, `<p>المتوفر: ${max}</p><input type="number" id="qtyInput" class="modal-input" placeholder="العدد" inputmode="numeric"><button class="btn btn-add" style="width:100%;" onclick="confirmAddQty(${id}, ${max})">إضافة</button>`);
}

function confirmAddQty(id, max) { 
    const qty = parseInt(document.getElementById('qtyInput').value); 
    if(qty > 0 && qty <= max) { 
        addToCart(id, qty); 
        closeModal(); 
    } else { 
        showToast('العدد خطأ'); 
    } 
}

async function addToCart(id, qty = 1) {
    const p = products.find(x => x.id === id);
    const item = cart.find(x => x.id === id);
    let priceToUse = item ? item.price : p.price;
    let currentQty = item ? item.qty : 0;
    if (currentQty + qty > p.stock) return showToast('الكمية غير متوفرة');
    if(item) { 
        item.qty += qty; 
    } else { 
        cart.push({...p, qty: qty, price: priceToUse, originalCost: p.cost || 0}); 
    }
    updateCartUI(); 
    saveAllToLocalStorage();
    updateProductCardById(id);
}

// === دالة لتحديث بطاقة منتج معين ===
function updateProductCardById(productId) {
    const productCard = document.querySelector(`.product-card[data-id="${productId}"]`);
    if (productCard) {
        updateProductCard(productCard);
    }
}

// === دالة لتحديث بطاقة منتج ===
function updateProductCard(card) {
    const productId = parseInt(card.getAttribute('data-id'));
    const p = products.find(prod => prod.id === productId);
    if (!p) return;

    const inCart = cart.find(x => x.id === productId)?.qty || 0;
    const remaining = p.stock - inCart;

    const codeClass = inCart > 0 ? 'short-code shifted' : 'short-code';
    
    card.innerHTML = `
        ${inCart > 0 ? `<div class="qty-badge">${inCart}</div>` : ''}
        <span class="${codeClass}">#${p.code || '---'}</span>
        <button class="edit-btn" onclick="openEditProduct(${p.id}, event)" style="position:absolute; left:0; top:0; background:none; border:none; color:#aaa; padding:10px;">⚙️</button>
        <div style="font-size:1.5rem; margin-top:15px;">🏗️</div>
        <h3 style="margin:5px 0;">${p.name}</h3>
        <div style="color:var(--accent); font-weight:bold;">${p.price.toLocaleString()}</div>
        <span class="${remaining<=0?'stock-out':(remaining<5?'stock-low':'stock-tag')}">${remaining<=0?'نفذت الكمية':`المتوفر: ${remaining}`}</span>
    `;

    if (remaining > 0) {
        card.ontouchstart = function(e) { 
            if(!e.target.closest('.edit-btn')) handleTouchStart(e, 'add', p.id); 
        };
        card.ontouchmove = function(e) { handleTouchMove(e); };
        card.ontouchend = function(e) { 
            if(!e.target.closest('.edit-btn')) handleTouchEnd(e, 'add', p.id); 
        };
        card.onmousedown = function(e) { 
            if(!e.target.closest('.edit-btn')) handleTouchStart(e, 'add', p.id); 
        };
        card.onmouseup = function(e) { 
            if(!e.target.closest('.edit-btn')) handleTouchEnd(e, 'add', p.id); 
        };
        card.onmouseleave = function() { clearTimeout(pressTimer); };
    } else {
        card.ontouchstart = null;
        card.ontouchmove = null;
        card.ontouchend = null;
        card.onmousedown = null;
        card.onmouseup = null;
        card.onmouseleave = null;
    }
}

function renderCategories() {
    const cats = ["الكل", ...new Set(products.map(p => p.cat || "عام"))];
    const container = document.getElementById('categoryTabs');
    container.innerHTML = cats.map(c => `<div class="cat-tab ${c === activeCategory ? 'active' : ''}" onclick="setCategory('${c}')">${c}</div>`).join('');
}

function setCategory(c) { 
    activeCategory = c; 
    renderCategories(); 
    filterProducts(); 
}

// === دالة البحث المحسنة ===
function filterProducts() {
    const q = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const grid = document.getElementById('productsGrid');
    
    if (allProductCards.length === 0) {
        createAllProductCards();
    }
    
    allProductCards.forEach(card => {
        const productName = card.getAttribute('data-name').toLowerCase();
        const productCode = card.getAttribute('data-code').toLowerCase();
        const productCat = card.getAttribute('data-cat') || "عام";
        
        const matchSearch = productName.includes(q) || productCode.includes(q);
        const matchCat = activeCategory === "الكل" || productCat === activeCategory;
        
        if (matchSearch && matchCat) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
    
    const visibleCards = allProductCards.filter(card => !card.classList.contains('hidden'));
    const noResultsMsg = grid.querySelector('.no-results');
    
    if (visibleCards.length === 0) {
        if (!noResultsMsg) {
            const msg = document.createElement('p');
            msg.className = 'no-results';
            msg.style.gridColumn = 'span 2';
            msg.style.textAlign = 'center';
            msg.style.color = '#777';
            msg.textContent = 'ماكو مواد';
            grid.appendChild(msg);
        }
    } else if (noResultsMsg) {
        noResultsMsg.remove();
    }
}

// === دالة لإنشاء جميع عناصر المنتجات مرة واحدة ===
function createAllProductCards() {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';
    allProductCards = [];
    
    products.forEach(p => {
        const inCart = cart.find(x => x.id === p.id)?.qty || 0;
        const remaining = p.stock - inCart;
        const div = document.createElement('div');
        div.className = 'product-card';
        div.setAttribute('data-name', p.name);
        div.setAttribute('data-code', p.code || '');
        div.setAttribute('data-cat', p.cat || 'عام');
        div.setAttribute('data-id', p.id);
        
        const codeClass = inCart > 0 ? 'short-code shifted' : 'short-code';
        div.innerHTML = `
            ${inCart > 0 ? `<div class="qty-badge">${inCart}</div>` : ''}
            <span class="${codeClass}">#${p.code || '---'}</span>
            <button class="edit-btn" onclick="openEditProduct(${p.id}, event)" style="position:absolute; left:0; top:0; background:none; border:none; color:#aaa; padding:10px;">⚙️</button>
            <div style="font-size:1.5rem; margin-top:15px;">🏗️</div>
            <h3 style="margin:5px 0;">${p.name}</h3>
            <div style="color:var(--accent); font-weight:bold;">${p.price.toLocaleString()}</div>
            <span class="${remaining<=0?'stock-out':(remaining<5?'stock-low':'stock-tag')}">${remaining<=0?'نفذت الكمية':`المتوفر: ${remaining}`}</span>
        `;
        
        if (remaining > 0) {
            div.ontouchstart = function(e) { if(!e.target.closest('.edit-btn')) handleTouchStart(e, 'add', p.id); };
            div.ontouchmove = function(e) { handleTouchMove(e); };
            div.ontouchend = function(e) { if(!e.target.closest('.edit-btn')) handleTouchEnd(e, 'add', p.id); };
            div.onmousedown = function(e) { if(!e.target.closest('.edit-btn')) handleTouchStart(e, 'add', p.id); };
            div.onmouseup = function(e) { if(!e.target.closest('.edit-btn')) handleTouchEnd(e, 'add', p.id); };
            div.onmouseleave = function() { clearTimeout(pressTimer); };
        }
        
        grid.appendChild(div);
        allProductCards.push(div);
    });
}

function initiateCheckout(action) {
    if(cart.length === 0) return showToast('القائمة فارغة');
    pendingAction = action;
    
    let subTotal = cart.reduce((a, b) => a + (b.price * b.qty), 0);
    let finalTotal = subTotal - invoiceDiscount;
    if(finalTotal < 0) finalTotal = 0;

    let custName = customerName;
    let custPhone = customerPhone;
    
    if(!custName || custName.trim() === "") custName = "زبون نقدي"; 

    showModal('نوع الدفع', `
        <h2 class="modal-total">المبلغ المطلوب: ${finalTotal.toLocaleString()}</h2>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn btn-print" style="flex:1;" onclick="processPayment('cash')">💵 واصل (نقد)</button>
            <button class="btn btn-delete" style="flex:1;" onclick="processPayment('credit')">📒دين</button>
            <button class="btn btn-partial" style="flex-basis: 100%; margin-top:5px;" onclick="askPartialPayment()">🗓️ واصل جزء / باقي</button>
        </div>
    `);
}

function askPartialPayment() {
    let subTotal = cart.reduce((a, b) => a + (b.price * b.qty), 0);
    let finalTotal = subTotal - invoiceDiscount;
    if(finalTotal < 0) finalTotal = 0;

    showModal('تسديد جزء (واصل)', `
        <h2 class="modal-total">المبلغ المطلوب: ${finalTotal.toLocaleString()}</h2>
        <input type="number" id="paidAmountInput" class="modal-input" placeholder="المبلغ الذي دفعه الزبون" inputmode="numeric">
        <button class="btn btn-add" style="width:100%;" onclick="processPayment('partial')">حفظ</button>
    `);
}

async function processPayment(type) {
    let subTotal = cart.reduce((a, b) => a + (b.price * b.qty), 0);
    let finalTotal = subTotal - invoiceDiscount;
    if(finalTotal < 0) finalTotal = 0;

    let custName = customerName;
    let custPhone = customerPhone;
    
    if(!custName || custName.trim() === "") custName = "زبون نقدي"; 

    if ((type === 'credit' || type === 'partial') && custName === "زبون نقدي") {
        showToast("يجب كتابة اسم الزبون للدين");
        return;
    }

    let remainingDebt = 0;

    if(type === 'credit') {
        remainingDebt = finalTotal;
    } else if (type === 'partial') {
        let paid = parseInt(document.getElementById('paidAmountInput').value);
        if(isNaN(paid) || paid < 0) return showToast('المبلغ غير صحيح');
        if(paid > finalTotal) return showToast('المبلغ المدفوع أكثر من المطلوب!');
        remainingDebt = finalTotal - paid;
    }

    if(type !== 'cash') {
        const existing = debts.find(d => d.name === custName);
        if(existing) { 
            existing.amount += remainingDebt; 
            existing.history.push({
                date: new Date().toLocaleString(), 
                amount: remainingDebt, 
                type: 'new',
                // إضافة معلومات إضافية للفاتورة المرتبطة
                invoiceId: document.getElementById('invoiceNum').innerText,
                invoiceDate: new Date().toLocaleString('ar-IQ')
            }); 
        } else { 
            debts.push({
                id: Date.now(), 
                name: custName, 
                phone: custPhone, 
                amount: remainingDebt, 
                history: [{
                    date: new Date().toLocaleString(), 
                    amount: remainingDebt, 
                    type: 'new',
                    // إضافة معلومات إضافية للفاتورة المرتبطة
                    invoiceId: document.getElementById('invoiceNum').innerText,
                    invoiceDate: new Date().toLocaleString('ar-IQ')
                }]
            }); 
        }
        if(remainingDebt > 0) showToast(`تم تسجيل باقي ${remainingDebt} على ${custName}`);
    }

    // حفظ نسخة من الفاتورة في الأرشيف مع ربطها بالدين إذا كان هناك دين
    let totalProfit = 0;
    cart.forEach(c => {
        let cost = c.originalCost || 0;
        totalProfit += (c.price - cost) * c.qty;
    });
    totalProfit -= invoiceDiscount;

    const newArchiveItem = {
        id: document.getElementById('invoiceNum').innerText, 
        date: new Date().toLocaleString(), 
        items: [...cart], 
        total: finalTotal, 
        profit: totalProfit || 0, 
        type: type, 
        customer: custName,
        phone: custPhone,
        // إضافة معلومات إضافية للربط بالديون
        debtAmount: remainingDebt > 0 ? remainingDebt : 0
    };
    
    archive.unshift(newArchiveItem);
    if(archive.length > 100) archive.pop();

    // حفظ كل شيء محلياً أولاً
    saveAllToLocalStorage();
    
    // تسجيل التغييرات للمزامنة
    trackChange('product_update', products);
    trackChange('archive_update', archive);
    trackChange('debt_update', debts);
    
    // تفريغ القائمة بعد الدفع
    cart = [];
    saveAllToLocalStorage();
    updateCartUI();
    allProductCards.forEach(updateProductCard);
    
    closeModal();

    // Check low stock after sale
    await checkLowStock();

    setTimeout(() => {
        if(pendingAction === 'print') window.print();
        else if(pendingAction === 'image') saveAsImage();
        else if(pendingAction === 'whatsapp') sendWhatsapp(custName, type);
    }, 500);
}

async function clearCart() {
    cart = []; 
    invoiceDiscount = 0; 
    customerName = "";
    customerPhone = "";
    document.getElementById('invoiceNum').innerText = Math.floor(Math.random()*9000)+1000;
    updateCustomerDisplay();
    updateCartUI(); 
    saveAllToLocalStorage();
    allProductCards.forEach(updateProductCard);
    closeModal();
    
    // تأكد من مسح السلة من localStorage
    try {
        localStorage.removeItem(LOCAL_STORAGE_KEYS.CART);
    } catch (error) {
        console.log("لا يمكن مسح السلة من localStorage:", error);
    }
}

function saveAsImage() {
    const el = document.getElementById('invoiceToSave');
    const btns = document.querySelectorAll('#cartItems button, .btn-edit-cart'); 
    btns.forEach(b => b.style.display='none');
    document.querySelectorAll('.editable-price').forEach(e => e.style.textDecoration='none');
    
    document.querySelectorAll('.customer-info-item').forEach(item => {
        item.style.cursor = 'default';
    });
    
    html2canvas(el, {scale:2}).then(canvas => {
        btns.forEach(b => b.style.display='inline-block'); 
        document.querySelectorAll('.editable-price').forEach(e => e.style.textDecoration='underline dashed');
        document.querySelectorAll('.customer-info-item').forEach(item => {
            item.style.cursor = 'pointer';
        });

        const link = document.createElement('a'); 
        link.download = `فاتورة_${Date.now()}.jpg`; 
        link.href = canvas.toDataURL(); 
        link.click();
    });
}

function sendWhatsapp(name, type) {
    let txt = `*فاتورة من أبو حسن*\nرقم: ${document.getElementById('invoiceNum').innerText}\nالزبون: ${name}\n`;
    if (customerPhone) txt += `رقم الهاتف: ${customerPhone}\n`;
    cart.forEach(i => txt += `${i.name} (${i.qty}) : ${i.price.toLocaleString()}\n`);
    let totalTxt = document.getElementById('invoiceCalculations').innerText.replace(/\n/g, ' ');
    txt += `\n*${totalTxt}*\n${settings.footer}`;
    
    let url = "https://wa.me/?text=" + encodeURIComponent(txt);
    window.open(url, '_blank');
}

function renderDebts() {
    const list = document.getElementById('debtList');
    const q = document.getElementById('debtSearch').value.toLowerCase();
    list.innerHTML = '';
    const filtered = debts.filter(d => d.amount > 0 && d.name.toLowerCase().includes(q));
    if(filtered.length === 0) { 
        list.innerHTML = '<p style="text-align:center">ماكو ديون</p>'; 
        return; 
    }
    filtered.forEach(d => {
        const div = document.createElement('div'); 
        div.className = 'debt-card';
        div.onclick = function(e) { 
            if(!e.target.closest('.btn')) openDebtHistory(d.id); 
        };
        
        div.innerHTML = `
            <div class="debt-info">
                <h4>${d.name}</h4>
                <span style="font-size:0.8rem; color:#aaa">آخر: ${d.history[d.history.length-1].date.split(',')[0]}</span>
            </div>
            <div style="text-align:left">
                <div class="debt-amount">${d.amount.toLocaleString()}</div>
                <button class="btn btn-print" style="padding:5px 10px; font-size:0.8rem; margin-top:5px;">تسديد</button>
            </div>
        `;
        const payBtn = div.querySelector('.btn-print');
        payBtn.onclick = function(e) { 
            e.stopPropagation(); 
            payDebt(d.id); 
        };
        list.appendChild(div);
    });
}

function openArchiveDetails(id) {
    const item = archive.find(a => a.id == id);
    if(!item) return;
    
    let rows = '';
    item.items.forEach(i => {
        rows += `<div class="detail-row"><span>${i.name} (x${i.qty})</span><span>${(i.price*i.qty).toLocaleString()}</span></div>`;
    });
    
    showModal(`فاتورة #${item.id}`, `
        <div class="date-info">${item.date}</div>
        <div class="customer-info">${item.customer} ${item.phone ? '('+item.phone+')' : ''}</div>
        <div class="detail-container">
            ${rows}
            <div class="detail-total">
                الإجمالي: ${item.total.toLocaleString()}
                ${item.debtAmount > 0 ? `<br><small style="color:var(--red)">المتبقي: ${item.debtAmount.toLocaleString()}</small>` : ''}
            </div>
        </div>
    `);
}

function openDebtHistory(id) {
    const debt = debts.find(d => d.id == id);
    if(!debt) return;
    
    let historyHtml = '';
    const recentHistory = debt.history.slice().reverse().slice(0, 20);
    
    recentHistory.forEach((h, index) => {
        const isPay = h.type === 'pay';
        historyHtml += `
            <div class="invoice-history-item" onclick="${!isPay ? `openDebtInvoiceDetails('${h.invoiceId || ''}')` : ''}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${isPay ? 'تسديد 💵' : `فاتورة #${h.invoiceId || 'N/A'} 📒`}</span>
                    <span class="hist-val ${isPay ? 'hist-type-pay' : 'hist-type-new'}">
                        ${h.amount.toLocaleString()}
                    </span>
                </div>
                <div class="hist-date">
                    ${h.date}
                    ${h.invoiceDate ? ` | ${h.invoiceDate}` : ''}
                </div>
                ${!isPay ? '<div style="font-size:0.7rem; color:#aaa; margin-top:3px;">انقر لعرض تفاصيل الفاتورة</div>' : ''}
            </div>
        `;
    });
    
    showModal(`كشف حساب: ${debt.name}`, `
        <h2 style="color:var(--red); text-align:center;">${debt.amount.toLocaleString()} د.ع</h2>
        ${debt.phone ? '<p style="text-align:center; color:#aaa; margin-bottom:15px;">'+debt.phone+'</p>' : ''}
        <div style="max-height:300px; overflow-y:auto; margin-top:10px; padding:10px; background:rgba(0,0,0,0.1); border-radius:8px;">
            ${historyHtml}
        </div>
        <div style="margin-top:15px; padding-top:10px; border-top:1px solid #555;">
            <button class="btn btn-print" style="width:100%;" onclick="payDebt(${id})">تسديد دين</button>
        </div>
    `);
}

// === دالة جديدة لعرض تفاصيل الفاتورة من سجل الديون ===
function openDebtInvoiceDetails(invoiceId) {
    if (!invoiceId || invoiceId === 'N/A') {
        showToast('لا توجد معلومات تفصيلية لهذه الفاتورة', 'warning');
        return;
    }
    
    const invoice = archive.find(a => a.id == invoiceId);
    if (!invoice) {
        showToast('لم يتم العثور على الفاتورة في الأرشيف', 'error');
        return;
    }
    
    let rows = '';
    invoice.items.forEach(i => {
        rows += `<div class="detail-row"><span>${i.name} (x${i.qty})</span><span>${(i.price*i.qty).toLocaleString()}</span></div>`;
    });
    
    showModal(`تفاصيل الفاتورة #${invoice.id}`, `
        <div class="date-info">${invoice.date}</div>
        <div class="customer-info">${invoice.customer} ${invoice.phone ? '('+invoice.phone+')' : ''}</div>
        <div class="detail-container">
            ${rows}
            <div class="detail-total">
                الإجمالي: ${invoice.total.toLocaleString()}
                ${invoice.debtAmount > 0 ? `<br><small style="color:var(--red)">المتبقي: ${invoice.debtAmount.toLocaleString()}</small>` : ''}
            </div>
        </div>
        <div style="margin-top:15px; text-align:center;">
            <button class="btn btn-image" style="width:100%;" onclick="reprintInvoice('${invoice.id}')">🖨️ إعادة طباعة</button>
        </div>
    `);
}

// === دالة لإعادة طباعة الفاتورة ===
function reprintInvoice(invoiceId) {
    const invoice = archive.find(a => a.id == invoiceId);
    if (!invoice) {
        showToast('لم يتم العثور على الفاتورة', 'error');
        return;
    }
    
    // حفظ الفاتورة الحالية مؤقتاً
    const currentCart = [...cart];
    const currentCustomerName = customerName;
    const currentCustomerPhone = customerPhone;
    const currentDiscount = invoiceDiscount;
    
    // تعبئة السلة بالفواتير القديمة
    cart = invoice.items.map(item => ({
        ...item,
        qty: item.qty,
        price: item.price
    }));
    
    customerName = invoice.customer;
    customerPhone = invoice.phone || "";
    invoiceDiscount = 0;
    
    // تحديث رقم الفاتورة وتاريخها
    document.getElementById('invoiceNum').innerText = invoice.id;
    document.getElementById('invoiceDate').innerText = invoice.date;
    
    // تحديث واجهة المستخدم
    updateCustomerDisplay();
    updateCartUI();
    
    // إظهار قسم الفاتورة
    switchTab('cart');
    
    showToast('تم تحميل الفاتورة، يمكنك طباعتها الآن');
    
    // بعد 5 ثوانٍ، استعادة الحالة السابقة
    setTimeout(() => {
        cart = currentCart;
        customerName = currentCustomerName;
        customerPhone = currentCustomerPhone;
        invoiceDiscount = currentDiscount;
        
        // تحديث رقم الفاتورة بتاريخ جديد
        document.getElementById('invoiceNum').innerText = Math.floor(Math.random()*9000)+1000;
        updateTime();
        
        updateCustomerDisplay();
        updateCartUI();
        allProductCards.forEach(updateProductCard);
    }, 30000); // 30 ثانية لإعطاء الوقت الكافي للطباعة
}

function payDebt(id) {
    const d = debts.find(x => x.id == id);
    showModal(`تسديد دين: ${d.name}`, `<p>باقي: ${d.amount.toLocaleString()}</p><input type="number" id="payAmount" class="modal-input" placeholder="الواصل"><button class="btn btn-print" style="width:100%;" onclick="confirmPay(${id})">تسجيل</button>`);
}

async function confirmPay(id) {
    const amount = Number(document.getElementById('payAmount').value);
    const d = debts.find(x => x.id == id);
    if(amount > 0 && amount <= d.amount) { 
        d.amount -= amount; 
        d.history.push({
            date: new Date().toLocaleString(), 
            amount: amount, 
            type: 'pay'
        }); 
        saveAllToLocalStorage();
        trackChange('debt_update', debts);
        renderDebts(); 
        closeModal(); 
        showToast('تم تسديد ' + amount.toLocaleString() + ' د.ع'); 
    } else { 
        showToast('مبلغ خطأ'); 
    }
}

function toggleGlobalLock() { 
    if(isGlobalUnlocked) { 
        isGlobalUnlocked = false; 
        updateLockIcon(); 
        showToast('تم القفل'); 
    } else { 
        secureAccess(() => { 
            isGlobalUnlocked = true; 
            updateLockIcon(); 
            showToast('مفتوح'); 
        }); 
    } 
}

function updateLockIcon() { 
    const icon = document.getElementById('lockIcon'); 
    icon.innerText = isGlobalUnlocked ? '🔓' : '🔒'; 
    icon.className = isGlobalUnlocked ? 'lock-status-open' : 'lock-status-closed'; 
}

function secureAccess(callback) { 
    if(isGlobalUnlocked) { 
        callback(); 
    } else { 
        showModal('يرجى ادخال كلمة السر', `
            <input type="password" id="pinInput" class="modal-input" placeholder="****" inputmode="numeric" autocomplete="off">
            <button class="btn btn-image" style="width:100%;" onclick="checkPin()">دخول</button>
        `); 
        window.tempCallback = callback; 
    } 
}

async function checkPin() { 
    const inputPin = document.getElementById('pinInput').value;
    if (inputPin) {
        //showToast("جاري التحقق من كلمة السر...");
        
        try {
            // التحقق من كلمة السر
            let isCorrect = false;
            
            if (isOnline && db) {
                // محاولة التحقق من Firebase أولاً
                isCorrect = await verifyPasswordFromFirebase(inputPin);
            }
            
            // إذا لم يكن هناك اتصال أو فشل التحقق من Firebase، حاول من التخزين المحلي
            if (!isCorrect && appPassword) {
                const inputHash = await hashPassword(inputPin);
                isCorrect = inputHash === appPassword;
            }
            
            if (isCorrect) { 
                closeModal(); 
                showToast("تم التحقق بنجاح");
                if(window.tempCallback) window.tempCallback(); 
            } else { 
                showToast('كلمة السر غير صحيح', 'error'); 
            }
        } catch (error) {
            console.error('خطأ في التحقق من كلمة السر:', error);
            showToast('خطأ في التحقق، حاول مرة أخرى', 'error');
        }
    } else {
        showToast('الرجاء إدخال كلمة السر');
    }
}

// === دالة لعرض معلومات كلمة السر ===
function showPasswordInfo() {
    // إنشاء نافذة منفصلة لمعلومات كلمة السر
    const modalHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <button class="modal-close-btn" onclick="closePasswordInfoModal()" style="position:absolute; top:10px; left:10px;">×</button>
            <h3 style="margin-top:10px; color:var(--accent); text-align:center;">معلومات كلمة السر</h3>
            <div style="text-align:center; padding:20px;">
                <div style="font-size:3rem; color:var(--accent);">🔐</div>
                <h3>نظام أمان كلمة السر</h3>
                <p style="margin:15px 0;">كلمة السر مخزنة بشكل مشفر ${isOnline ? 'في Firebase والتخزين المحلي' : 'في التخزين المحلي'}</p>
                
                <div style="background:${document.body.classList.contains('dark-mode') ? '#222' : '#f5f5f5'}; padding:15px; border-radius:10px; margin:15px 0;">
                    <p style="color:${document.body.classList.contains('dark-mode') ? '#aaa' : '#666'}; margin-bottom:5px;">حالة الاتصال:</p>
                    <p style="color:${isOnline ? 'var(--green)' : 'var(--red)'}; font-weight:bold;">
                        ${isOnline ? 'متصل بالسحابة' : 'غير متصل - العمل محلياً'}
                    </p>
                    
                    <p style="color:${document.body.classList.contains('dark-mode') ? '#aaa' : '#666'}; margin-top:15px; margin-bottom:5px;">نوع التشفير:</p>
                    <p style="color:var(--green); font-weight:bold;">SHA-256 Hash</p>
                </div>
                
                <p style="font-size:0.9rem; color:${document.body.classList.contains('dark-mode') ? '#aaa' : '#666'};">يمكنك تغيير كلمة السر من إعدادات التطبيق</p>
            </div>
        </div>
    `;
    
    // إنشاء عنصر جديد للنافذة
    const passwordInfoModal = document.createElement('div');
    passwordInfoModal.id = 'passwordInfoModal';
    passwordInfoModal.className = 'modal-overlay';
    passwordInfoModal.style.display = 'flex';
    passwordInfoModal.style.zIndex = '1000';
    passwordInfoModal.innerHTML = modalHTML;
    
    // إضافة حدث لإغلاق النافذة عند النقر خارجها
    passwordInfoModal.onclick = function(e) {
        if (e.target === passwordInfoModal) {
            closePasswordInfoModal();
        }
    };
    
    // إضافة النافذة الجديدة إلى body
    document.body.appendChild(passwordInfoModal);
}

// دالة جديدة لإغلاق نافذة معلومات كلمة السر فقط
function closePasswordInfoModal() {
    const passwordInfoModal = document.getElementById('passwordInfoModal');
    if (passwordInfoModal) {
        passwordInfoModal.remove();
    }
}

// === دالة لتغيير كلمة السر مباشرة ===
async function changePasswordDirect() {
    showModal('تغيير كلمة السر', `
        <h4 style="color:var(--accent); border-bottom:1px solid #555; padding-bottom:10px; margin-bottom:15px;">تغيير كلمة السر</h4>
        
        <label class="input-label" style="display:block;text-align:right">كلمة السر الحالية (للتحقق)</label>
        <input type="password" id="currentPin" class="modal-input" placeholder="كلمة السر الحالية">
        
        <label class="input-label" style="display:block;text-align:right">كلمة السر الجديدة</label>
        <input type="password" id="newPin" class="modal-input" placeholder="كلمة السر الجديدة">
        
        <label class="input-label" style="display:block;text-align:right">تأكيد كلمة السر الجديدة</label>
        <input type="password" id="confirmNewPin" class="modal-input" placeholder="تأكيد كلمة السر الجديدة">
        
        <button class="btn btn-delete" style="width:100%; margin-top:10px" onclick="saveDirectPassword()">تغيير كلمة السر</button>
    `);
}

async function saveDirectPassword() {
    const currentPin = document.getElementById('currentPin').value;
    const newPin = document.getElementById('newPin').value;
    const confirmPin = document.getElementById('confirmNewPin').value;
    
    if (!currentPin) {
        showToast("الرجاء إدخال كلمة السر الحالية", "error");
        return;
    }
    
    if (!newPin || !confirmPin) {
        showToast("الرجاء إدخال كلمة السر الجديدة وتأكيدها", "error");
        return;
    }
    
    if (newPin !== confirmPin) {
        showToast("كلمة السر الجديدة وتأكيدها غير متطابقين", "error");
        return;
    }
    
    if (newPin.length < 4) {
        showToast("كلمة السر يجب أن تكون 4 أحرف على الأقل", "error");
        return;
    }
    
    try {
        // التحقق من كلمة السر الحالية
        let isCurrentCorrect = false;
        
        if (appPassword) {
            const currentHash = await hashPassword(currentPin);
            isCurrentCorrect = currentHash === appPassword;
        } else if (isOnline && db) {
            isCurrentCorrect = await verifyPasswordFromFirebase(currentPin);
        }
        
        if (!isCurrentCorrect) {
            showToast("كلمة السر الحالية غير صحيحة", "error");
            return;
        }
        
        // تغيير كلمة السر
        const newHash = await hashPassword(newPin);
        appPassword = newHash;
        saveToLocalStorage(LOCAL_STORAGE_KEYS.PASSWORD, appPassword);
        
        // محاولة التحديث في Firebase إذا كان هناك اتصال
        if (isOnline && db) {
            try {
                await savePasswordToFirebase(newPin);
            } catch (firebaseError) {
                console.error('خطأ في تحديث كلمة السر في Firebase:', firebaseError);
            }
        }
        
        closeModal();
        showToast("تم تغيير كلمة السر بنجاح");
    } catch (error) {
        showToast("خطأ في تغيير كلمة السر", "error");
    }
}

function openSettings() {
    showModal('الإعدادات', `
        <h4 style="color:var(--accent); border-bottom:1px solid #555; padding-bottom:10px; margin-bottom:15px;">إعدادات الفاتورة</h4>
        
        <label class="input-label" style="display:block;text-align:right">النص السفلي للفاتورة</label>
        <textarea id="setFooter" class="modal-input" rows="3">${settings.footer}</textarea>
        
        <label class="input-label" style="display:block;text-align:right">رقم الهاتف</label>
        <input type="text" id="setPhone" class="modal-input" value="${settings.phone}">
        
        <div style="height:15px;"></div>
        
        <h4 style="color:var(--accent); border-bottom:1px solid #555; padding-bottom:10px; margin-bottom:15px;">إدارة كلمة السر</h4>
        
        <div style="display:flex; gap:10px; align-items:center; margin-bottom:15px;">
            <button class="btn btn-print" style="flex:1;" onclick="secureAccess(changePasswordDirect)">تغيير كلمة السر</button>
            <button class="btn" onclick="showPasswordInfo()" style="width:50px; height:50px; padding:0; display:flex; align-items:center; justify-content:center; font-size:1.5rem; background:#444; border-radius:8px;">🔐</button>
        </div>
        
        <div style="display:flex; gap:10px; margin-bottom:15px;">
            <button class="btn btn-image" style="flex:1;" onclick="manualSync()">🔄 مزامنة يدوية</button>
            <button class="btn btn-wa" style="flex:1;" onclick="exportBackup()">📤 تصدير نسخة</button>
        </div>
        
        <button class="btn btn-add" style="width:100%; margin-top:20px" onclick="saveSettings()">حفظ إعدادات الفاتورة</button>
    `);
}

async function saveSettings() {
    const newFooter = document.getElementById('setFooter').value;
    const newPhone = document.getElementById('setPhone').value;
    
    let hasChanges = false;
    
    // تحديث إعدادات الفاتورة إذا تغيرت
    if (newFooter !== settings.footer || newPhone !== settings.phone) {
        settings.footer = newFooter;
        settings.phone = newPhone;
        settings.lastModified = Date.now();
        
        saveAllToLocalStorage();
        trackChange('settings_update', settings);
        
        document.getElementById('phoneDisplay').innerText = settings.phone;
        document.getElementById('invFooterText').innerText = settings.footer;
        showToast("تم تحديث إعدادات الفاتورة");
        hasChanges = true;
    }
    
    if (hasChanges) {
        closeModal();
        showToast("تم حفظ الإعدادات بنجاح");
    } else {
        showToast("لم يتم إجراء أي تغييرات");
    }
}

// === مزامنة يدوية ===
async function manualSync() {
    if (!isOnline) {
        showToast("غير متصل بالإنترنت", "error");
        showConnectionStatusTemporarily("غير متصل بالإنترنت", "error");
        return;
    }
    
    if (isSyncing) {
        showToast("جاري المزامنة بالفعل", "warning");
        return;
    }
    
    showToast("بدء المزامنة اليدوية...");
    showConnectionStatusTemporarily("جاري المزامنة اليدوية...", "syncing", 3000);
    
    try {
        await syncAll();
        
        // بعد اكتمال المزامنة اليدوية
        setTimeout(() => {
            showConnectionStatusTemporarily('متصل بالسحابة وجاهز للعمل', 'success');
        }, 500);
        
    } catch (error) {
        console.error("خطأ في المزامنة اليدوية:", error);
    }
}

// === تصدير نسخة احتياطية ===
function exportBackup() {
    const backupData = {
        products: products,
        archive: archive,
        debts: debts,
        settings: settings,
        timestamp: new Date().toISOString(),
        version: '1.0'
    };
    
    const dataStr = JSON.stringify(backupData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_abuhassan_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    showToast("تم تصدير النسخة الاحتياطية");
}

function openAddModal() {
    showModal('مادة جديدة', `
        <input id="nName" class="modal-input" placeholder="اسم المادة">
        <input id="nPrice" type="number" class="modal-input" placeholder="سعر البيع">
        <input id="nCost" type="number" class="modal-input" placeholder="سعر الشراء (التكلفة)">
        <input id="nStock" type="number" class="modal-input" placeholder="العدد المخزني">
        <input id="nCat" class="modal-input" placeholder="التصنيف">
        <button class="btn btn-add" style="width:100%;" onclick="addNewProd()">إضافة</button>
    `);
}

async function addNewProd() {
    const name = document.getElementById('nName').value;
    const price = document.getElementById('nPrice').value;
    const cost = document.getElementById('nCost').value || 0;
    const cat = document.getElementById('nCat').value || "عام";
    if(name && price) {
        const newProd = {
            id: Date.now(), 
            name, 
            price: Number(price), 
            cost: Number(cost),
            stock: Number(document.getElementById('nStock').value)||0, 
            cat, 
            code: Math.random().toString(36).substr(2,2).toUpperCase(),
            lastModified: Date.now()
        };
        
        products.push(newProd);
        saveAllToLocalStorage();
        trackChange('product_update', products);
        renderCategories(); 
        allProductCards = [];
        filterProducts(); 
        closeModal();
        
        await checkLowStock();
    }
}

function openEditProduct(id, e) {
    if(e) e.stopPropagation();
    const p = products.find(x => x.id == id);
    secureAccess(() => {
        showModal('تعديل', `
            <input id="eName" class="modal-input" value="${p.name}">
            <label>سعر البيع</label>
            <input id="ePrice" class="modal-input" value="${p.price}">
            <label>سعر الشراء</label>
            <input id="eCost" class="modal-input" value="${p.cost || 0}">
            <label>المخزون</label>
            <input id="eStock" class="modal-input" value="${p.stock}">
            <input id="eCat" class="modal-input" value="${p.cat||'عام'}">
            <div style="display:flex; gap:10px; margin-top:10px;">
                <button class="btn btn-print" style="flex:1;" onclick="saveProdEdit(${id})">حفظ</button>
                <button class="btn btn-delete" style="flex:1;" onclick="delProd(${id})">حذف</button>
            </div>
        `);
    });
}

async function saveProdEdit(id) {
    const p = products.find(x => x.id == id);
    p.name = document.getElementById('eName').value;
    p.price = Number(document.getElementById('ePrice').value);
    p.cost = Number(document.getElementById('eCost').value);
    p.stock = Number(document.getElementById('eStock').value);
    p.cat = document.getElementById('eCat').value;
    p.lastModified = Date.now();
    
    saveAllToLocalStorage();
    trackChange('product_update', products);
    renderCategories(); 
    allProductCards = [];
    filterProducts(); 
    closeModal();
    
    await checkLowStock();
}

async function delProd(id) { 
    if(confirm('هل أنت متأكد من حذف هذه المادة؟')) { 
        products = products.filter(x => x.id != id); 
        saveAllToLocalStorage();
        trackChange('product_update', products);
        allProductCards = [];
        filterProducts(); 
        closeModal(); 
        
        await checkLowStock();
    } 
}

async function openStats() {
    try {
        let salesToday = 0, salesMonth = 0, profitToday = 0;
        let prodCounts = {};
        
        const currentDate = new Date();
        const todayStr = getTodayDateString();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        
        archive.forEach(a => {
            try {
                if (a.date && a.date.includes(todayStr)) {
                    salesToday += a.total || 0; 
                    profitToday += (a.profit || 0);
                }
                
                const archiveDate = new Date(a.date);
                if (archiveDate.getMonth() + 1 === currentMonth && archiveDate.getFullYear() === currentYear) {
                    salesMonth += a.total || 0;
                }
                
                if (a.items && Array.isArray(a.items)) {
                    a.items.forEach(i => {
                        if (i && i.name) {
                            prodCounts[i.name] = (prodCounts[i.name] || 0) + (i.qty || 0);
                        }
                    });
                }
            } catch (e) {
                console.error('Error processing archive item:', e);
            }
        });

        const totalDebt = debts.reduce((a,b) => a + (b.amount || 0), 0);
        document.getElementById('statToday').innerText = salesToday.toLocaleString();
        document.getElementById('statProfit').innerText = profitToday.toLocaleString();
        document.getElementById('statMonth').innerText = salesMonth.toLocaleString();
        document.getElementById('statDebtTotal').innerText = totalDebt.toLocaleString();
        
        const sortedProds = Object.entries(prodCounts).sort((a,b) => b[1] - a[1]).slice(0,3);
        document.getElementById('topProductsList').innerHTML = sortedProds.map(p => 
            `<div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #444;">
                <span>${p[0]}</span>
                <span style="color:var(--accent)">${p[1]} قطعة</span>
            </div>`
        ).join('');
        
        setTimeout(() => {
            initSalesChart();
        }, 100);
    } catch (error) {
        console.error('Error in openStats:', error);
        showToast('خطأ في تحميل الإحصائيات');
    }
}

async function resetStats() {
    showConfirm('هل أنت متأكد من تصفير الإحصائيات؟', async () => {
        location.reload();
    });
}

function showModal(t,b){ 
    document.getElementById('modalTitle').innerText=t; 
    document.getElementById('modalBody').innerHTML=b; 
    document.getElementById('mainModal').style.display='flex'; 
}

function closeModal(){ 
    document.getElementById('mainModal').style.display='none'; 
}

function closeModalOnOverlay(event) {
    if (event.target.id === 'mainModal') {
        closeModal();
    }
}

function openClearModal(){ 
    if(cart.length>0) showModal('تفريغ', `<button class="btn btn-delete" style="width:100%;" onclick="clearCart()">مسح الكل</button>`); 
}