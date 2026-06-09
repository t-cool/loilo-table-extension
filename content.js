// ---------------------------------------------------------
// 定数・設定
// ---------------------------------------------------------
console.log('Loilo Table Extension: Content script loaded.');

const TABLE_ICON_SVG_WHITE = `
<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="4" width="18" height="16" rx="2" stroke="white" stroke-width="2"/>
  <path d="M3 10H21" stroke="white" stroke-width="2"/>
  <path d="M3 15H21" stroke="white" stroke-width="2"/>
  <path d="M9 4V20" stroke="white" stroke-width="2"/>
  <path d="M15 4V20" stroke="white" stroke-width="2"/>
</svg>`;

let colWidths = [];

// ---------------------------------------------------------
// モーダルUIの作成・取得関数
// ---------------------------------------------------------
function getOrCreateModal() {
  let m = document.getElementById('loilo-table-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'loilo-table-modal';
    Object.assign(m.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'none',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: '2147483647',
      fontFamily: 'sans-serif'
    });
    
    m.innerHTML = `
      <div class="loilo-table-modal-content" style="background:white; padding:24px; border-radius:12px; width:90%; max-width:600px; max-height:80vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.5); pointer-events:auto;">
        <div class="loilo-table-modal-header" style="margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0; font-size:20px; color:#333;">表の作成</h2>
        </div>
        <div class="loilo-table-config" style="margin-bottom:20px; display:flex; flex-wrap:wrap; gap:15px; align-items:center;">
          <label style="font-weight:bold;">行: <input type="number" id="loilo-rows" value="4" min="1" max="20" style="width:60px; padding:8px; border:1px solid #ccc;"></label>
          <label style="font-weight:bold;">列: <input type="number" id="loilo-cols" value="2" min="1" max="10" style="width:60px; padding:8px; border:1px solid #ccc;"></label>
          <label style="font-weight:bold;">横幅(px): <input type="number" id="loilo-total-width" value="600" min="100" max="2000" style="width:80px; padding:8px; border:1px solid #ccc;"></label>
        </div>
        <div class="loilo-table-editor" style="width:100%; overflow-x:auto; margin-bottom:20px; border:1px solid #eee;">
          <table class="loilo-table-grid" id="loilo-grid" style="border-collapse:collapse; width:100%; table-layout:fixed;"></table>
        </div>
        <div class="loilo-table-actions" style="display:flex; justify-content:flex-end; gap:12px;">
          <button class="loilo-btn loilo-btn-cancel" id="loilo-cancel" style="padding:10px 20px; border-radius:6px; border:none; cursor:pointer; background:#e0e0e0; font-weight:bold;">キャンセル</button>
          <button class="loilo-btn loilo-btn-insert" id="loilo-do-insert" style="padding:10px 20px; border-radius:6px; border:none; cursor:pointer; background:#007aff; color:white; font-weight:bold;">表をカードとして挿入</button>
        </div>
      </div>
    `;
    // ロイロのダイアログレイヤーがあればそこに、なければbodyに
    const targetLayer = document.querySelector('.dialogLayer') || document.body;
    targetLayer.appendChild(m);
    
    // イベント登録
    m.querySelector('#loilo-cancel').onclick = (e) => { 
        e.stopPropagation();
        m.style.display = 'none'; 
    };
    m.querySelector('#loilo-rows').onchange = updateGrid;
    m.querySelector('#loilo-cols').onchange = updateGrid;
    m.querySelector('#loilo-total-width').onchange = () => {
       const g = document.getElementById('loilo-grid');
       if(g) g.style.width = m.querySelector('#loilo-total-width').value + 'px';
       updateGrid();
    };
    m.querySelector('#loilo-do-insert').onclick = handleInsertClick;
  }
  return m;
}

// ---------------------------------------------------------
// ボタンの注入ロジック
// ---------------------------------------------------------
function injectButtons() {
  if (document.getElementById('loilo-table-btn-injected')) return;

  const textTool = document.querySelector('.editorTextTool');
  let targetGroup = null;
  if (textTool) targetGroup = textTool.closest('.editorHeaderButtonGroup');

  if (targetGroup) {
    const wrapper = document.createElement('div');
    wrapper.className = 'editorButton loilo-table-wrapper';
    
    const tableBtn = document.createElement('div');
    tableBtn.id = 'loilo-table-btn-injected';
    tableBtn.className = 'loilo-table-injected-btn';
    tableBtn.innerHTML = `
      ${TABLE_ICON_SVG_WHITE}
      <div class="loilo-table-btn-label">表</div>
    `;

    const handleOpen = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      console.log('Loilo Table Extension: Interaction detected.');
      
      const m = getOrCreateModal();
      
      // 常に最前面レイヤーへ移動
      const topLayer = document.querySelector('.alertDialogLayer') || document.querySelector('.dialogLayer') || document.body;
      topLayer.appendChild(m);
      
      updateGrid();
      m.style.setProperty('display', 'flex', 'important');
      m.style.setProperty('z-index', '2147483647', 'important');
      
      console.log('Loilo Table Extension: Modal display set to flex.');
      return false;
    };

    ['mousedown', 'click', 'touchstart'].forEach(type => {
      tableBtn.addEventListener(type, handleOpen, true);
    });

    tableBtn.style.pointerEvents = 'auto';
    tableBtn.style.zIndex = '2147483647';

    wrapper.appendChild(tableBtn);
    const bgColorBtn = targetGroup.querySelector('[aria-label="背景色"]');
    if (bgColorBtn && bgColorBtn.parentElement) {
       bgColorBtn.parentElement.before(wrapper);
    } else {
       targetGroup.appendChild(wrapper);
    }
  }
}

const observer = new MutationObserver(() => {
  if (!document.getElementById('loilo-table-btn-injected')) injectButtons();
});
observer.observe(document.body, { childList: true, subtree: true });
injectButtons();

// ---------------------------------------------------------
// グリッド・リサイズロジック (既存)
// ---------------------------------------------------------
function initResizers() {
  const g = document.getElementById('loilo-grid');
  if(!g) return;
  const ths = g.querySelectorAll('th');
  ths.forEach((th, i) => {
    if (i < ths.length - 1) {
      const resizer = document.createElement('div');
      resizer.className = 'loilo-resizer';
      th.appendChild(resizer);
      createResizableColumn(th, resizer, i);
    }
  });
}

function createResizableColumn(th, resizer, index) {
  let x = 0; let w = 0;
  const onMouseMove = (e) => {
    const dx = e.clientX - x;
    const newWidth = Math.max(30, w + dx);
    colWidths[index] = newWidth;
    th.style.width = `${newWidth}px`;
  };
  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    resizer.classList.remove('resizing');
  };
  resizer.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    x = e.clientX;
    w = parseInt(window.getComputedStyle(th).width, 10);
    resizer.classList.add('resizing');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function updateGrid() {
  const m = getOrCreateModal();
  const rows = parseInt(m.querySelector('#loilo-rows').value) || 1;
  const cols = parseInt(m.querySelector('#loilo-cols').value) || 1;
  const totalWidth = parseInt(m.querySelector('#loilo-total-width').value) || 600;
  const g = m.querySelector('#loilo-grid');
  
  g.style.width = `${totalWidth}px`;
  g.innerHTML = '';
  const initialWidth = totalWidth / cols;
  colWidths = new Array(cols).fill(initialWidth);

  const headerTr = document.createElement('tr');
  for (let c = 0; c < cols; c++) {
    const th = document.createElement('th');
    th.style.width = `${colWidths[c]}px`;
    th.style.border = '1px solid #ccc';
    th.style.padding = '0';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `見出し ${c + 1}`;
    input.style.width = '100%';
    input.style.border = 'none';
    input.style.padding = '8px';
    input.style.boxSizing = 'border-box';
    input.style.fontWeight = 'bold';
    th.appendChild(input);
    headerTr.appendChild(th);
  }
  g.appendChild(headerTr);

  for (let r = 0; r < rows - 1; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      td.style.border = '1px solid #ccc';
      td.style.padding = '0';
      const input = document.createElement('input');
      input.type = 'text';
      input.style.width = '100%';
      input.style.border = 'none';
      input.style.padding = '8px';
      input.style.boxSizing = 'border-box';
      td.appendChild(input);
      tr.appendChild(td);
    }
    g.appendChild(tr);
  }
  initResizers();
}

async function renderTableToBlob() {
  const m = getOrCreateModal();
  const totalTableWidth = parseInt(m.querySelector('#loilo-total-width').value);
  const allRows = m.querySelectorAll('#loilo-grid tr');
  const ths = allRows[0].querySelectorAll('th');
  const actualWidths = Array.from(ths).map(th => th.offsetWidth);
  const actualTotal = actualWidths.reduce((a, b) => a + b, 0);
  const scale = totalTableWidth / actualTotal;
  const finalColWidths = actualWidths.map(w => w * scale);

  const data = [];
  for (let i = 0; i < allRows.length; i++) {
    const inputs = allRows[i].querySelectorAll('input');
    data.push(Array.from(inputs).map(input => input.value || (i === 0 ? input.placeholder : "")));
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const cellPadding = 15;
  const fontSize = 20;
  ctx.font = `${fontSize}px sans-serif`;
  const rowHeight = fontSize + cellPadding * 2;
  const totalHeight = rowHeight * data.length;

  const dpr = 2;
  canvas.width = totalTableWidth * dpr;
  canvas.height = totalHeight * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, totalTableWidth, totalHeight);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  let currentY = 0;
  data.forEach((row, r) => {
    let currentX = 0;
    if (r === 0) {
      ctx.fillStyle = '#4a90e2'; ctx.fillRect(0, currentY, totalTableWidth, rowHeight); ctx.fillStyle = 'white';
    } else {
      ctx.fillStyle = '#333';
      if (r % 2 === 0) { ctx.fillStyle = '#f9f9f9'; ctx.fillRect(0, currentY, totalTableWidth, rowHeight); ctx.fillStyle = '#333'; }
    }
    row.forEach((text, c) => {
      const w = finalColWidths[c];
      ctx.strokeRect(currentX, currentY, w, rowHeight);
      ctx.save();
      ctx.beginPath(); ctx.rect(currentX, currentY, w, rowHeight); ctx.clip();
      ctx.fillText(text, currentX + cellPadding, currentY + rowHeight / 2);
      ctx.restore();
      currentX += w;
    });
    currentY += rowHeight;
  });

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// ---------------------------------------------------------
// ロイロノートへの挿入（クリップボード経由）
// ---------------------------------------------------------
async function copyToClipboardAndPaste(blob) {
  try {
    const item = new ClipboardItem({ "image/png": blob });
    await navigator.clipboard.write([item]);
    console.log('Loilo Table Extension: Image copied to clipboard.');

    // 貼り付けを実行 (Ctrl+V)
    const pasteEvent = new KeyboardEvent('keydown', {
      key: 'v',
      code: 'KeyV',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    
    // 貼り付け先を探索
    const target = document.querySelector('.editorCanvas') || 
                   document.querySelector('.canvas') || 
                   document.body;
    
    target.dispatchEvent(pasteEvent);
    
    showToast('クリップボードにコピーしました。Ctrl+V で貼り付けてください。');
  } catch (err) {
    console.error('Loilo Table Extension: Failed to copy image.', err);
    showToast('コピーに失敗しました。権限を確認してください。');
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.innerText = message;
  toast.style = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:#333; color:white; padding:12px 24px; border-radius:24px; z-index:2147483647; font-size:14px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// simulateDrop を置き換え
async function handleInsertClick(e) {
  e.stopPropagation();
  const m = getOrCreateModal();
  const blob = await renderTableToBlob();
  await copyToClipboardAndPaste(blob);
  m.style.display = 'none';
}
