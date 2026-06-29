// =========================================================
// PANINI COPA 2026 - Storefront TikTok Shop
// =========================================================

const FRETE_META = 120;
const FRETE_COUNTDOWN_MINUTES = 20;
const FALLBACK_MEDIA = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

const lojaState = {
  nome: '', descricao: '', logo: null, logoUpdatedAt: null,
  cartinha_titulo_topo: '', cartinha_desconto_texto: '', cartinha_subtitulo: '',
  cartinha_linha1: '', cartinha_linha2: '', cartinha_linha3: '', cartinha_linha4: '',
  cartinha_timer_prefixo: '', cartinha_botao_texto: '',
  banner_ativo: false, banner: null
};

const lojaDefaults = (() => {
  const nomeEl = document.getElementById('loja-nome');
  const logoEl = document.getElementById('loja-logo');
  return {
    nome: nomeEl ? (nomeEl.textContent || 'Shop').trim() : 'Shop',
    logo: logoEl ? (logoEl.getAttribute('data-default-logo') || logoEl.getAttribute('src') || '') : '',
    cartinha_titulo_topo: (document.getElementById('cartinha-titulo-topo')?.textContent || '').trim(),
    cartinha_desconto_texto: (document.getElementById('cartinha-desconto-texto')?.textContent || '').trim(),
    cartinha_subtitulo: (document.getElementById('cartinha-subtitulo')?.textContent || '').trim(),
    cartinha_linha1: (document.getElementById('cartinha-linha1')?.textContent || '').trim(),
    cartinha_linha2: (document.getElementById('cartinha-linha2')?.textContent || '').trim(),
    cartinha_linha3: (document.getElementById('cartinha-linha3')?.textContent || '').trim(),
    cartinha_linha4: (document.getElementById('cartinha-linha4')?.textContent || '').trim(),
    cartinha_timer_prefixo: (document.getElementById('cartinha-timer-prefixo')?.textContent || '').trim(),
    cartinha_botao_texto: (document.getElementById('btnResgatarCartinha')?.textContent || '').trim(),
  };
})();

let produtoSelecionado = null;
let variacoesSelecionadasPorTipo = {};
let produtosData = [];
let modalProdutoAtual = null;
let productsContainer = null;
let toggleIconRef = null;
let precoIconRef = null;
let toggleBtnRef = null;
let currentFilter = 'recomendado';
let tabPanes = {};
let galleryImages = [];
let galleryIndex = 0;
let galleryTouchStartX = null;
let bodyScrollY = 0;
let isGrid = false;

// ----- utilidades de mídia -----
function resolveMediaPath(path) {
  if (!path) return FALLBACK_MEDIA;
  if (/^https?:\/\//i.test(path) || /^data:/i.test(path)) return path;
  const raw = String(path).trim().replace(/^\.\//, '');
  try {
    if (raw.startsWith('/')) return new URL(raw, window.location.origin || document.baseURI).toString();
    if (raw.includes('/')) return new URL(`/${raw.replace(/^\/+/, '')}`, window.location.origin || document.baseURI).toString();
    return new URL(raw, document.baseURI).toString();
  } catch { return raw.startsWith('/') ? raw : `/${raw}`; }
}

function buildGalleryImages(primary, extras = []) {
  const list = [];
  const add = (v) => { if (!v) return; const r = resolveMediaPath(v); if (r && !list.includes(r)) list.push(r); };
  add(primary);
  if (Array.isArray(extras)) extras.forEach(add);
  if (!list.length) list.push(FALLBACK_MEDIA);
  return list;
}

function formatBRL(v) { return Number(v || 0).toFixed(2).replace('.', ','); }

function calcularDesconto(preco, precoComp) {
  const a = Number(preco || 0), b = Number(precoComp || 0);
  if (!b || b <= a) return 0;
  return Math.round(((b - a) / b) * 100);
}

function getCartTotal() {
  const c = JSON.parse(localStorage.getItem('carrinho') || '[]');
  return c.reduce((s, i) => s + (Number(i.preco ?? 0) * Math.max(1, Number(i.quantidade ?? 1))), 0);
}

// ----- frete grátis -----
function updateFreteProgress() {
  const total = getCartTotal();
  const percent = Math.min(100, Math.round((total / FRETE_META) * 100));
  const fill = document.getElementById('freteProgressFill');
  const text = document.getElementById('freteProgressText');
  const meta = document.getElementById('freteProgressValue');
  const btn = document.getElementById('freteResgateBtn');
  if (fill) fill.style.width = `${percent}%`;
  if (meta) meta.textContent = `R$ ${formatBRL(total)} / R$ ${formatBRL(FRETE_META)}`;
  const ready = total >= FRETE_META;
  if (!ready) localStorage.removeItem('freteGratisResgatado');
  if (text) text.textContent = ready ? 'Frete gratis liberado no checkout!' : `Faltam R$ ${formatBRL(FRETE_META - total)} para liberar o frete gratis.`;
  if (btn) {
    const resgatado = localStorage.getItem('freteGratisResgatado') === '1';
    btn.disabled = !ready;
    btn.classList.toggle('is-ready', ready && !resgatado);
    btn.textContent = resgatado ? 'Frete gratis ativado' : 'Resgatar frete gratis';
  }
  const couponBtn = document.querySelector('.resgatar-btn[data-code="FRETEGRATIS"]');
  if (couponBtn) {
    const resgatados = new Set(JSON.parse(localStorage.getItem('cuponsResgatados') || '[]'));
    if (!resgatados.has('FRETEGRATIS')) couponBtn.disabled = !ready;
  }
}

function initFreteCountdown() {
  const el = document.getElementById('freteCountdown');
  if (!el) return;
  const key = 'freteCountdownStart';
  let start = sessionStorage.getItem(key);
  if (!start) { start = String(Date.now()); sessionStorage.setItem(key, start); }
  const startedAt = Number(start);
  const duration = FRETE_COUNTDOWN_MINUTES * 60 * 1000;
  const tick = () => {
    const remaining = Math.max(0, duration - (Date.now() - startedAt));
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (remaining > 0) setTimeout(tick, 1000);
  };
  tick();
}

function limitarTexto(t, n) { if (!t) return ''; return t.length > n ? t.substring(0, n).trim() + '...' : t; }

// ----- modais (carrinho / produto) -----
function lockBody() {
  bodyScrollY = window.scrollY || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${bodyScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
}
function unlockBody() {
  const top = document.body.style.top;
  ['position','top','left','right','width','overflow'].forEach(p => document.body.style.removeProperty(p));
  const y = top ? parseInt(top, 10) : 0;
  window.scrollTo(0, (y && !Number.isNaN(y)) ? -y : (bodyScrollY || 0));
}

function abrirCarrinho() {
  const modal = document.getElementById('modalCarrinho');
  const content = document.getElementById('modalCarrinhoContent');
  if (!modal || !content) return;
  lockBody();
  modal.classList.remove('hidden');
  requestAnimationFrame(() => content.classList.remove('translate-y-full'));
}
function fecharCarrinho() {
  const modal = document.getElementById('modalCarrinho');
  const content = document.getElementById('modalCarrinhoContent');
  if (!modal || !content) return;
  content.classList.add('translate-y-full');
  setTimeout(() => { modal.classList.add('hidden'); unlockBody(); }, 300);
}
function abrirModal() {
  const modal = document.getElementById('meuModal');
  if (!modal) return;
  lockBody();
  modal.classList.remove('hidden');
}
function fecharModal() {
  document.getElementById('meuModal')?.classList.add('hidden');
  unlockBody();
  produtoSelecionado = null;
  variacoesSelecionadasPorTipo = {};
}

// ----- toast -----
function showCenterToast(message, type = 'success', duration = 2000) {
  const toast = document.createElement('div');
  toast.className = 'toast-center';
  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
    info: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="white"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"/></svg>`
  };
  toast.innerHTML = `<span class="toast-icon ${type}">${icons[type] || icons.info}</span><span class="toast-text">${message}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 250); }, duration);
}

// ----- galeria -----
function showImageViewerIndex(i) {
  if (!galleryImages.length) return;
  galleryIndex = (i + galleryImages.length) % galleryImages.length;
  const img = document.getElementById('imageViewerImg');
  if (img) { img.onerror = () => { img.onerror = null; img.src = FALLBACK_MEDIA; }; img.src = galleryImages[galleryIndex]; }
  const counter = document.getElementById('imageViewerCounter');
  if (counter) counter.textContent = galleryImages.length > 1 ? `${galleryIndex + 1} / ${galleryImages.length}` : '';
  const showNav = galleryImages.length > 1;
  document.getElementById('imageViewerPrev').style.display = showNav ? 'flex' : 'none';
  document.getElementById('imageViewerNext').style.display = showNav ? 'flex' : 'none';
}
function openImageViewer(images, start = 0) {
  const viewer = document.getElementById('imageViewer');
  if (!viewer) return;
  galleryImages = (Array.isArray(images) ? images.filter(Boolean) : []);
  if (!galleryImages.length) galleryImages = [FALLBACK_MEDIA];
  showImageViewerIndex(Math.max(0, Math.min(start, galleryImages.length - 1)));
  viewer.classList.add('show');
}
function closeImageViewer() { document.getElementById('imageViewer')?.classList.remove('show'); }

// ----- carrinho -----
// Resolve a imagem atual do produto - busca em produtosData se a do item nao existir/quebrar
function resolverImagemItem(item) {
  // 1. Se o item tem imagem em formato atual (.png/.jpg/.webp/.jpeg), usa
  const itemImg = String(item.imagem || '').trim();
  if (itemImg && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(itemImg)) {
    return resolveMediaPath(itemImg);
  }
  // 2. Busca pelo produto no cache e usa a imagem atual
  if (Array.isArray(produtosData) && item.produtoId) {
    const prod = produtosData.find(p => String(p.id) === String(item.produtoId));
    if (prod) {
      // Tenta pela variacao primeiro
      if (item.variacaoId && Array.isArray(prod.variacoes)) {
        const v = prod.variacoes.find(x => String(x.id) === String(item.variacaoId));
        if (v && v.imagem) return resolveMediaPath(v.imagem);
      }
      if (prod.imagemPrincipal) return resolveMediaPath(prod.imagemPrincipal);
    }
  }
  // 3. Fallback
  return itemImg ? resolveMediaPath(itemImg) : FALLBACK_MEDIA;
}

function renderCarrinho() {
  const container = document.getElementById('carrinhoContainer');
  const totalSpan = document.getElementById('quantidade_x');
  if (!container) return;
  const carrinho = JSON.parse(localStorage.getItem('carrinho') || '[]');
  container.innerHTML = '';
  let totalItens = 0;

  carrinho.forEach((item, index) => {
    const precoItem = Number(item.preco ?? 0);
    const precoComp = Number(item.precoComparacao ?? precoItem);
    const qtd = Math.max(1, Number(item.quantidade ?? 1));
    const subtotal = precoItem * qtd;
    totalItens += qtd;
    const imagemFinal = resolverImagemItem(item);

    const card = document.createElement('div');
    card.className = 'flex items-start gap-4 p-3 bg-white rounded shadow';
    card.innerHTML = `
      <div class="cart-image-wrap" data-action="open-gallery" data-gallery-index="${index}">
        <img src="${imagemFinal}" alt="${item.titulo || ''}" class="cart-image" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_MEDIA}';">
        <button type="button" class="cart-image-zoom" aria-label="Ampliar"><i class="fas fa-up-right-and-down-left-from-center"></i></button>
      </div>
      <div class="flex-1 flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-start">
            <h3 class="font-semibold text-sm mb-1">${limitarTexto(item.titulo || '', 40)}</h3>
            <button data-index="${index}" class="text-red-500 hover:text-red-700 text-lg font-bold" aria-label="Remover">×</button>
          </div>
          <p class="text-xs text-gray-500">Desconto: ${(item.desconto ?? 0)}%</p>
          <p class="text-sm text-gray-700 font-bold">R$ ${formatBRL(precoItem)}</p>
          <p class="text-xs line-through text-gray-400">R$ ${formatBRL(precoComp)}</p>
          <p class="text-xs text-green-600 mt-1">Subtotal: <strong>R$ ${formatBRL(subtotal)}</strong></p>
        </div>
        <div class="flex items-center justify-between mt-2">
          <div class="flex items-center gap-1">
            <button data-index="${index}" data-delta="-1" class="bg-gray-200 px-2 rounded text-sm">-</button>
            <input type="number" value="${qtd}" min="1" data-index="${index}" class="w-12 text-center border rounded text-sm" />
            <button data-index="${index}" data-delta="1" class="bg-gray-200 px-2 rounded text-sm">+</button>
          </div>
        </div>
      </div>`;
    container.appendChild(card);
  });

  if (container.children.length === 0) {
    const p = document.createElement('p');
    p.className = 'text-sm text-gray-500 text-center py-4';
    p.textContent = 'Seu carrinho está vazio no momento.';
    container.appendChild(p);
  }

  if (totalSpan) totalSpan.innerText = totalItens.toString();

  container.querySelectorAll('button[data-delta]').forEach(b => b.addEventListener('click', () => alterarQuantidade(+b.dataset.index, +b.dataset.delta)));
  container.querySelectorAll('input[type="number"]').forEach(i => i.addEventListener('change', () => alterarQuantidadeDireto(+i.dataset.index, i.value)));
  container.querySelectorAll('button[data-index]:not([data-delta])').forEach(b => b.addEventListener('click', () => removerDoCarrinho(+b.dataset.index)));
  container.querySelectorAll('[data-action="open-gallery"]').forEach(b => b.addEventListener('click', () => {
    const idx = +b.dataset.galleryIndex;
    const c = JSON.parse(localStorage.getItem('carrinho') || '[]');
    const it = c[idx]; if (!it) return;
    openImageViewer(buildGalleryImages(it.imagem || '', Array.isArray(it.fotos) ? it.fotos : []), 0);
  }));
  updateFreteProgress();
}
function removerDoCarrinho(i) { const c = JSON.parse(localStorage.getItem('carrinho') || '[]'); c.splice(i, 1); localStorage.setItem('carrinho', JSON.stringify(c)); renderCarrinho(); }
function alterarQuantidade(i, d) { const c = JSON.parse(localStorage.getItem('carrinho') || '[]'); if (!c[i]) return; c[i].quantidade = Math.max(1, Number(c[i].quantidade ?? 1) + d); localStorage.setItem('carrinho', JSON.stringify(c)); renderCarrinho(); }
function alterarQuantidadeDireto(i, v) { const c = JSON.parse(localStorage.getItem('carrinho') || '[]'); if (!c[i]) return; let q = parseInt(v, 10); if (!q || q < 1) q = 1; c[i].quantidade = q; localStorage.setItem('carrinho', JSON.stringify(c)); renderCarrinho(); }

// ----- variações no modal de produto -----
function renderVariacoes(variacoes = []) {
  const grid = document.getElementById('grid-variacoes');
  if (!grid) return;
  grid.innerHTML = '';
  variacoesSelecionadasPorTipo = {};

  if (!variacoes.length) {
    const p = document.createElement('p');
    p.className = 'text-sm text-gray-500';
    p.textContent = 'Este produto não possui variações cadastradas.';
    grid.appendChild(p);
    montarBotaoCompra();
    return;
  }

  const grupos = {};
  variacoes.forEach((v, idx) => {
    const tipo = String(v.tipo || 'variacao').toLowerCase();
    if (!grupos[tipo]) grupos[tipo] = [];
    const preco = Number(v.preco ?? 0);
    let precoComp = Number(v.precoComparacao ?? v.preco_comparacao ?? preco);
    if (!precoComp || precoComp <= preco) precoComp = preco;
    let desc = Number(v.desconto ?? 0);
    if (!desc) desc = calcularDesconto(preco, precoComp);
    grupos[tipo].push({ ...v, idx, tipo, titulo: v.titulo ?? '', preco, precoComparacao: precoComp, desconto: desc, imagem: resolveMediaPath(v.imagem || (modalProdutoAtual?.imagemPrincipal || '')) });
  });

  Object.keys(grupos).forEach(tipo => {
    const label = tipo.charAt(0).toUpperCase() + tipo.slice(1);
    const title = document.createElement('div');
    title.className = 'font-semibold text-sm mb-1 mt-2';
    title.textContent = label;
    grid.appendChild(title);

    const row = document.createElement('div');
    row.className = 'variation-row scrollbar-hide';

    const groupGallery = buildGalleryImages(modalProdutoAtual?.imagemPrincipal || '', grupos[tipo].map(v => v.imagem || ''));

    grupos[tipo].forEach((variacao, optionIndex) => {
      const btn = document.createElement('div');
      btn.className = `variation-card${tipo === 'tamanho' ? ' is-size' : ''}`;
      btn.setAttribute('role', 'button'); btn.setAttribute('tabindex', '0');

      const imgWrap = document.createElement('div'); imgWrap.className = 'variation-image-wrap';
      const img = document.createElement('img'); img.className = 'variation-image'; img.alt = variacao.titulo; img.src = variacao.imagem || FALLBACK_MEDIA; img.loading = 'lazy';
      img.onerror = () => { img.onerror = null; img.src = FALLBACK_MEDIA; };
      imgWrap.appendChild(img);

      const zoom = document.createElement('button');
      zoom.type = 'button'; zoom.className = 'variation-zoom';
      zoom.innerHTML = '<i class="fas fa-up-right-and-down-left-from-center"></i>';
      zoom.addEventListener('click', e => { e.stopPropagation(); openImageViewer(groupGallery, Math.max(0, groupGallery.indexOf(variacao.imagem))); });
      imgWrap.appendChild(zoom);

      const lbl = document.createElement('span'); lbl.className = 'variation-label'; lbl.textContent = variacao.titulo;
      const lblWrap = document.createElement('div'); lblWrap.className = 'variation-label-wrap'; lblWrap.appendChild(lbl);

      btn.appendChild(imgWrap); btn.appendChild(lblWrap);

      const select = () => {
        row.querySelectorAll('.variation-card.is-selected').forEach(c => c.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        variacoesSelecionadasPorTipo[tipo] = variacao;
        atualizarResumoSelecaoModal();
      };
      btn.addEventListener('click', select);
      btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
      row.appendChild(btn);

      if (optionIndex === 0) { btn.classList.add('is-selected'); variacoesSelecionadasPorTipo[tipo] = variacao; }
    });
    grid.appendChild(row);
  });

  atualizarResumoSelecaoModal();
  montarBotaoCompra();
}

function montarBotaoCompra() {
  const conteudo = document.getElementById('modal-conteudo');
  let buyBox = document.getElementById('buy-positions');
  if (!buyBox) { buyBox = document.createElement('div'); buyBox.id = 'buy-positions'; conteudo.appendChild(buyBox); }
  buyBox.innerHTML = `<a href="javascript:void(0);" onclick="comprarAgora()" id="div_ors_4" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3 text-center block" style="font-size:1.1rem; border-radius: 12px;">Comprar Agora</a>`;
  let qtyBox = document.getElementById('qty-row');
  if (!qtyBox) { qtyBox = document.createElement('div'); qtyBox.id = 'qty-row'; qtyBox.className = 'mt-4 mb-2'; conteudo.insertBefore(qtyBox, buyBox); }
  qtyBox.innerHTML = `
    <div class="flex items-center justify-between">
      <label class="font-medium mr-2">QUANTIDADE</label>
      <div class="flex items-center border rounded px-2 py-1 bg-white">
        <button type="button" id="qtd-menos" class="text-lg px-2">-</button>
        <input type="number" id="qtd-input" value="1" min="1" class="w-12 text-center mx-1 border-none outline-none" />
        <button type="button" id="qtd-mais" class="text-lg px-2">+</button>
      </div>
    </div>`;
  const input = qtyBox.querySelector('#qtd-input');
  qtyBox.querySelector('#qtd-menos').addEventListener('click', () => { let v = parseInt(input.value, 10) || 1; if (v > 1) v--; input.value = v; });
  qtyBox.querySelector('#qtd-mais').addEventListener('click', () => { let v = parseInt(input.value, 10) || 1; v++; input.value = v; });
  input.addEventListener('change', () => { let v = parseInt(input.value, 10); if (!v || v < 1) v = 1; input.value = v; });
}

function atualizarResumoSelecaoModal() {
  if (!modalProdutoAtual) return;
  const vCor = variacoesSelecionadasPorTipo.cor || null;
  const vTam = variacoesSelecionadasPorTipo.tamanho || null;
  const temCor = Array.isArray(modalProdutoAtual?.variacoes) && modalProdutoAtual.variacoes.some(v => String(v.tipo || '').toLowerCase() === 'cor');
  const usarTamComoPrinc = !temCor && !!vTam;
  const vPrinc = usarTamComoPrinc ? vTam : vCor;
  const vPac = usarTamComoPrinc ? null : vTam;

  const tituloA = vPrinc?.titulo || modalProdutoAtual.titulo || '';
  const tituloP = vPac?.titulo || '';
  const tituloFinal = tituloP ? `${tituloA} + ${tituloP}` : tituloA;

  const pA = Number(vPrinc?.preco ?? modalProdutoAtual.preco ?? 0);
  let pAc = Number(vPrinc?.precoComparacao ?? modalProdutoAtual.precoComparacao ?? pA);
  if (pAc <= 0) pAc = pA;
  const pP = Number(vPac?.preco ?? 0);
  let pPc = Number(vPac?.precoComparacao ?? pP);
  if (pPc <= 0) pPc = pP;

  const pTotal = pA + pP;
  const pTotalC = pAc + pPc;
  const descTotal = calcularDesconto(pTotal, pTotalC);

  const imgA = vPrinc?.imagem || modalProdutoAtual.imagemPrincipal || FALLBACK_MEDIA;
  const imgP = vPac?.imagem || '';
  const imgPrinc = imgP || imgA;

  document.getElementById('div_ors_1').innerText = tituloFinal;
  document.getElementById('div_ors_3').innerHTML = `<span style='background:#fe2d55;color:#fff;font-weight:700;padding:2px 8px;border-radius:6px;font-size:1.2rem;margin-right:8px;'>-${Math.round(descTotal)}%</span> <span style='color:#fe2d55;font-size:1.3rem;font-weight:700;'>R$ ${formatBRL(pTotal)}</span>`;
  document.getElementById('div_ors_2').innerHTML = (pTotalC > pTotal) ? `<span style='color:#aaa;text-decoration:line-through;font-size:1rem;'>R$ ${formatBRL(pTotalC)}</span>` : '';
  const modalImg = document.getElementById('img-solts');
  if (modalImg) { modalImg.onerror = () => { modalImg.onerror = null; modalImg.src = FALLBACK_MEDIA; }; modalImg.src = imgPrinc || FALLBACK_MEDIA; }

  const itemAlbum = {
    produtoId: modalProdutoAtual?.id ?? null,
    variacaoId: vPrinc?.id ?? null,
    tipoVariacao: usarTamComoPrinc ? 'tamanho' : 'cor',
    titulo: tituloA, preco: pA, precoComparacao: pAc,
    desconto: calcularDesconto(pA, pAc),
    imagem: imgA, fotos: buildGalleryImages(imgA, modalProdutoAtual?.fotos),
    quantidade: 1
  };
  const comboItens = [itemAlbum];
  if (vPac) comboItens.push({
    produtoId: modalProdutoAtual?.id ?? null,
    variacaoId: vPac.id ?? null,
    tipoVariacao: 'tamanho',
    titulo: vPac.titulo, preco: pP, precoComparacao: pPc,
    desconto: calcularDesconto(pP, pPc),
    imagem: imgP || imgA,
    fotos: buildGalleryImages(imgP || imgA, modalProdutoAtual?.fotos),
    quantidade: 1
  });
  produtoSelecionado = { ...itemAlbum, titulo: tituloFinal, preco: pTotal, precoComparacao: pTotalC, desconto: descTotal, imagem: imgPrinc, comboItens };
}

function abrirModalProduto(produto) {
  modalProdutoAtual = produto;
  produtoSelecionado = null;
  variacoesSelecionadasPorTipo = {};
  abrirModal();
  if (window.ttq) {
    try {
      window.ttq.track('ViewContent', {
        contents: [{ content_id: String(produto.id || ''), content_name: produto.titulo || '', content_type: 'product', price: Number(produto.preco || 0), quantity: 1 }],
        value: Number(produto.preco || 0),
        currency: 'BRL'
      });
    } catch (e) {}
  }
  const loader = document.getElementById('modal-loader');
  const conteudo = document.getElementById('modal-conteudo');
  loader?.classList.remove('hidden');
  conteudo?.classList.add('hidden');

  setTimeout(() => {
    const img = document.getElementById('img-solts');
    const title = document.getElementById('div_ors_1');
    const preco = document.getElementById('div_ors_3');
    const precoComp = document.getElementById('div_ors_2');
    if (img) { img.onerror = () => { img.onerror = null; img.src = FALLBACK_MEDIA; }; img.src = produto.imagemPrincipal || FALLBACK_MEDIA; }
    if (title) title.innerHTML = produto.titulo || '';
    if (preco) preco.innerHTML = `<span style='background:#fe2d55;color:#fff;font-weight:700;padding:2px 8px;border-radius:6px;font-size:1.2rem;margin-right:8px;${produto.desconto ? '' : 'display:none;'}'>${produto.desconto ? '-' + Math.round(produto.desconto) + '%' : ''}</span> <span style='color:#fe2d55;font-size:1.3rem;font-weight:700;'>R$ ${formatBRL(produto.preco)}</span>`;
    if (precoComp) precoComp.innerHTML = produto.precoComparacao && produto.precoComparacao > produto.preco ? `<span style='color:#aaa;text-decoration:line-through;font-size:1rem;'>R$ ${formatBRL(produto.precoComparacao)}</span>` : '';
    if (produto.variacoes.length === 0) {
      const gImgs = buildGalleryImages(produto.imagemPrincipal, produto.fotos);
      produtoSelecionado = { produtoId: produto.id, titulo: produto.titulo, preco: produto.preco, precoComparacao: produto.precoComparacao, desconto: produto.desconto, imagem: gImgs[0] || FALLBACK_MEDIA, fotos: gImgs, quantidade: 1 };
    }
    document.getElementById('titulo-variacoes').textContent = produto.variacoes.length ? 'Variações' : 'Produto';
    renderVariacoes(produto.variacoes);
    loader?.classList.add('hidden');
    conteudo?.classList.remove('hidden');
  }, 400);
}

function comprarAgora() {
  if (!produtoSelecionado) { showCenterToast('Selecione uma variação para continuar.', 'error', 2200); return; }
  const qtdInput = document.getElementById('qtd-input');
  let quantidade = qtdInput ? parseInt(qtdInput.value, 10) || 1 : 1;
  produtoSelecionado.quantidade = quantidade;

  const carrinho = JSON.parse(localStorage.getItem('carrinho') || '[]');
  const itens = (Array.isArray(produtoSelecionado.comboItens) && produtoSelecionado.comboItens.length) ? produtoSelecionado.comboItens : [produtoSelecionado];
  let adicionados = 0, duplicados = 0;
  itens.forEach(b => {
    const item = { ...b, quantidade };
    const existe = carrinho.some(p => String(p.titulo || '') === String(item.titulo || '') && String(p.variacaoId ?? '') === String(item.variacaoId ?? '') && String(p.tipoVariacao ?? '') === String(item.tipoVariacao ?? ''));
    if (existe) { duplicados++; return; }
    carrinho.push(item); adicionados++;
  });
  if (!adicionados) { showCenterToast('Esses itens já estão no seu carrinho.', 'info', 2200); return; }
  localStorage.setItem('carrinho', JSON.stringify(carrinho));
  if (window.ttq) {
    try {
      const contents = itens.map(it => ({ content_id: String(it.variacaoId || it.produtoId || ''), content_name: it.titulo || '', content_type: 'product', price: Number(it.preco || 0), quantity: quantidade }));
      const value = itens.reduce((s, it) => s + Number(it.preco || 0) * quantidade, 0);
      window.ttq.track('AddToCart', { contents, value, currency: 'BRL' });
    } catch (e) {}
  }
  renderCarrinho();
  fecharModal();
  showCenterToast(adicionados > 1 ? 'Itens adicionados ao carrinho.' : 'Adicionado ao carrinho', 'success', 1800);
  if (duplicados > 0) setTimeout(() => showCenterToast('Alguns itens já estavam no carrinho.', 'info', 1800), 350);
}

function finalizarCompra() {
  const carrinho = JSON.parse(localStorage.getItem('carrinho') || '[]');
  if (!carrinho.length) { showCenterToast('Seu carrinho está vazio.', 'info', 1800); return; }
  sessionStorage.setItem('checkoutCarrinho', JSON.stringify(carrinho));
  if (window.ttq) {
    try {
      const contents = carrinho.map(it => ({ content_id: String(it.variacaoId || it.produtoId || ''), content_name: it.titulo || '', content_type: 'product', price: Number(it.preco || 0), quantity: Math.max(1, Number(it.quantidade || 1)) }));
      const value = carrinho.reduce((s, it) => s + Number(it.preco || 0) * Math.max(1, Number(it.quantidade || 1)), 0);
      window.ttq.track('InitiateCheckout', { contents, value, currency: 'BRL' });
    } catch (e) {}
  }
  window.location.href = 'cart.php/';
}

// ----- normalização e render -----
function normalizarProduto(p) {
  const fotos = Array.isArray(p.fotos) ? p.fotos : (p.imagem ? [p.imagem] : []);
  const imagemPrincipal = resolveMediaPath(p.imagemPrincipal || fotos[0] || p.imagem || '');
  const preco = Number(p.preco ?? 0);
  let precoComp = Number(p.preco_comparacao ?? p.precoComparacao ?? 0);
  if (!precoComp || precoComp <= preco) precoComp = preco;
  let desc = Number(p.desconto ?? 0);
  if (!desc) desc = calcularDesconto(preco, precoComp);
  const variacoes = Array.isArray(p.variacoes) ? p.variacoes.map(v => {
    const vp = Number(v.preco ?? preco);
    let vc = Number(v.preco_comparacao ?? v.precoComparacao ?? precoComp ?? vp);
    if (!vc || vc <= vp) vc = precoComp > vp ? precoComp : vp;
    return { id: v.id ?? null, titulo: v.titulo ?? '', tipo: v.tipo ?? 'tamanho', preco: vp, precoComparacao: vc, desconto: calcularDesconto(vp, vc), info: v.info ?? '', imagem: resolveMediaPath(v.imagem ?? fotos[0] ?? '') };
  }) : [];
  return {
    id: p.id ?? null, titulo: p.titulo ?? '',
    preco, precoComparacao: precoComp, desconto: desc,
    notas: p.notas ?? '', vendidos: Number(p.quantidade_produtos ?? 0),
    imagemPrincipal, fotos: fotos.map(resolveMediaPath), variacoes,
    checkoutUrl: 'cart.php?produto_id=' + encodeURIComponent(p.id ?? '')
  };
}

function ordenarProdutos() {
  produtosData.sort((a, b) => Number(b.preco || 0) - Number(a.preco || 0));
}

function renderProdutos() {
  let lista = produtosData.slice();
  if (currentFilter === 'mais-vendidos') lista.sort((a, b) => Number(b.vendidos || 0) - Number(a.vendidos || 0));
  else if (currentFilter === 'lancamentos') lista.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  if (!productsContainer) return;
  productsContainer.innerHTML = '';
  productsContainer.className = isGrid ? 'p-3 grid grid-cols-2 gap-4 bg-white' : 'p-3 flex flex-col items-center space-y-3 bg-white';

  if (!lista.length) { const p = document.createElement('p'); p.className = 'text-sm text-gray-500'; p.textContent = 'Nenhum produto disponível no momento.'; productsContainer.appendChild(p); return; }

  lista.forEach((produto, index) => {
    const card = document.createElement('div');
    const rating = produto.notas || '5.0';
    const vendidos = produto.vendidos || 0;
    const produtoPageUrl = 'produto.php?produto_id=' + encodeURIComponent(produto.id);
    if (isGrid) {
      card.className = 'bg-white rounded-xl shadow p-2 flex flex-col min-h-[220px] justify-between border border-gray-100 w-full';
      card.innerHTML = `
        <a href="${produtoPageUrl}" class="block w-full" style="min-height:100px;max-height:120px;margin-bottom:2px;">
          <img src="${produto.imagemPrincipal}" alt="Produto" class="object-contain rounded-t-xl w-full h-[120px] bg-white" style="background:transparent;display:block;" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_MEDIA}';">
        </a>
        <div class="flex-1 flex flex-col justify-between">
          <a href="${produtoPageUrl}" class="flex flex-col gap-0 no-underline text-inherit">
            <span class="text-gray-900 text-xs font-semibold truncate mb-0.5" style="line-height:1.1;" title="${produto.titulo}">${produto.titulo}</span>
            <div class="flex flex-row gap-0.5 items-center mb-0.5">
              <span class="bg-rose-100 text-rose-600 text-[10px] font-bold px-1 py-0.5 rounded flex items-center gap-0.5">
                <img src='/uploads/bilhete.png' width='10' height='10' alt='Bilhete' />
                ${produto.desconto ? Math.round(produto.desconto) : '0'}% OFF
              </span>
              <span class="bg-cyan-100 text-cyan-600 text-[10px] font-bold px-1 py-0.5 rounded">frete grátis</span>
            </div>
            <div class="flex flex-row gap-0.5 items-center mb-0.5">
              <span class="text-yellow-400 text-xs">★</span>
              <span class="text-gray-700 text-[10px]">${rating} | ${vendidos} vendidos</span>
            </div>
          </a>
          <div class="flex flex-row items-end justify-between mt-2 pb-1">
            <div class="flex flex-col min-w-0">
              <span class="text-rose-500 text-base font-bold leading-tight whitespace-nowrap">R$ ${formatBRL(produto.preco)}</span>
              <span class="text-gray-400 text-xs line-through whitespace-nowrap">R$ ${formatBRL(produto.precoComparacao)}</span>
            </div>
            <div class="flex items-center gap-0 ml-1">
              <button class="bg-rose-100 text-rose-600 text-[11px] px-2 py-0.5 h-6 flex items-center justify-center" data-action="open-modal" data-index="${index}" aria-label="Ver opções" style="border-radius:8px 0 0 8px;">
                <span class="icon-mask-cart" aria-hidden="true" style="width:12px;height:12px;"></span>
              </button>
              <a href="${produtoPageUrl}" class="bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold px-2 py-0.5 h-6 flex items-center no-underline" style="border-radius:0 8px 8px 0;">Comprar</a>
            </div>
          </div>
        </div>`;
    } else {
      card.className = 'w-full max-w-[500px] bg-white flex flex-row rounded-lg';
      card.innerHTML = `
        <a href="${produtoPageUrl}" class="flex-shrink-0 mr-3 block" style="width:110px;height:120px;">
          <img src="${produto.imagemPrincipal}" alt="Produto" class="w-full h-full object-contain" style="display:block;background:transparent;" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_MEDIA}';">
        </a>
        <div class="flex flex-col justify-between flex-1 min-w-0 pb-2" style="min-height:120px;">
          <a href="${produtoPageUrl}" class="flex flex-col gap-0 flex-1 justify-center no-underline text-inherit">
            <div class="flex flex-row gap-1 items-center mt-0.5">
              <span class="text-gray-900 text-xs font-semibold truncate" style="max-width:220px;">${produto.titulo}</span>
            </div>
            <div class="flex flex-row gap-1 items-center mt-0.5">
              <span class="bg-rose-100 text-rose-600 text-[11px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                <img src='/uploads/bilhete.png' width='13' height='13' alt='Bilhete' />
                ${produto.desconto ? Math.round(produto.desconto) : '0'}% OFF
              </span>
              <span class="bg-cyan-100 text-cyan-600 text-[11px] font-bold px-2 py-0.5 rounded">Frete grátis</span>
            </div>
            <div class="flex flex-row gap-1 items-center mt-0.5">
              <span class="text-yellow-400 text-xs">★</span>
              <span class="text-gray-700 text-[11px]">${rating} | ${vendidos} vendido(s)</span>
            </div>
          </a>
          <div class="flex flex-row items-end justify-between mt-1">
            <div class="flex flex-col">
              <span class="text-rose-500 text-base font-bold leading-tight">R$ ${formatBRL(produto.preco)}</span>
              <span class="text-gray-400 text-xs line-through">R$ ${formatBRL(produto.precoComparacao)}</span>
            </div>
            <div class="flex items-center gap-0 ml-2">
              <button class="bg-rose-100 text-rose-600 text-[11px] px-3 py-1 h-8 flex items-center" data-action="open-modal" data-index="${index}" aria-label="Ver opções" style="border-radius:8px 0 0 8px;">
                <span class="icon-mask-cart" aria-hidden="true" style="width:14px;height:14px;"></span>
              </button>
              <a href="${produtoPageUrl}" class="bg-rose-600 hover:bg-rose-700 text-white text-[12px] font-semibold px-3 py-1 h-8 flex items-center no-underline" style="border-radius:0 8px 8px 0;">Comprar</a>
            </div>
          </div>
        </div>`;
    }
    productsContainer.appendChild(card);
    card.querySelectorAll('[data-action="open-modal"]').forEach(b => b.addEventListener('click', () => abrirModalProduto(produtosData[index])));
  });
}

function renderHomeSections() {
  const pEl = document.getElementById('homePrincipais');
  const rEl = document.getElementById('homeRecomendados');
  if (!pEl || !rEl) return;
  const principais = produtosData.slice(0, 3);
  const recomendados = produtosData.slice(0, 4);
  pEl.innerHTML = ''; rEl.innerHTML = '';

  principais.forEach((produto, idx) => {
    const card = document.createElement('div');
    const produtoPageUrl = 'produto.php?produto_id=' + encodeURIComponent(produto.id);
    card.className = 'home-card bg-white rounded-lg shadow border border-gray-100 p-2 flex-shrink-0';
    card.innerHTML = `
      <a href="${produtoPageUrl}" class="home-image-wrap mb-2 block">
        <img src="${produto.imagemPrincipal}" alt="${produto.titulo}" class="home-image" loading="lazy">
      </a>
      <a href="${produtoPageUrl}" class="flex flex-col gap-1 no-underline text-inherit">
        <span class="text-[12px] text-gray-800 leading-tight line-clamp-2">${produto.titulo}</span>
        <div class="flex items-center gap-1 text-[10px] font-bold">
          <span class="bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded">${produto.desconto ? Math.round(produto.desconto) : '0'}% OFF</span>
          <span class="bg-green-100 text-green-600 px-1.5 py-0.5 rounded">Frete grátis</span>
        </div>
        <div class="flex items-center gap-0.5 text-[11px] text-gray-600">
          <span class="text-yellow-400">★</span><span>${produto.notas || '5.0'} | ${produto.vendidos || 0} vendido(s)</span>
        </div>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-rose-600 font-bold text-base">R$ ${formatBRL(produto.preco)}</span>
          <span class="text-gray-400 text-xs line-through">R$ ${formatBRL(produto.precoComparacao)}</span>
        </div>
      </a>
      <div class="mt-2 flex items-center justify-between">
        <button class="bg-rose-100 text-rose-600 text-[11px] px-2 py-1 rounded-md flex items-center gap-1" data-action="open-modal">
          <span class="icon-mask-cart" style="width:14px;height:14px;"></span> Ver opções
        </button>
        <a href="${produtoPageUrl}" class="bg-rose-600 text-white text-[12px] font-semibold px-3 py-1 rounded-md no-underline">Comprar</a>
      </div>`;
    card.querySelectorAll('[data-action="open-modal"]').forEach(b => b.addEventListener('click', () => abrirModalProduto(produto)));
    pEl.appendChild(card);
  });

  recomendados.forEach((produto, idx) => {
    const card = document.createElement('div');
    const produtoPageUrl = 'produto.php?produto_id=' + encodeURIComponent(produto.id);
    card.className = 'bg-white rounded-xl shadow-sm border border-gray-100 p-2 flex flex-col gap-1 cursor-pointer';
    card.innerHTML = `
      <div class="home-image-wrap">
        <img src="${produto.imagemPrincipal}" alt="${produto.titulo}" class="home-image" loading="lazy">
      </div>
      <span class="text-[12px] text-gray-800 leading-tight line-clamp-2">${produto.titulo}</span>
      <div class="flex items-center gap-1 text-[10px] font-bold">
        <span class="bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded">${produto.desconto ? Math.round(produto.desconto) : '0'}% OFF</span>
        <span class="bg-green-100 text-green-600 px-1.5 py-0.5 rounded">Frete grátis</span>
      </div>
      <div class="flex items-center gap-2 mt-1">
        <span class="text-rose-600 font-bold text-base">R$ ${formatBRL(produto.preco)}</span>
        <span class="text-gray-400 text-xs line-through">R$ ${formatBRL(produto.precoComparacao)}</span>
      </div>`;
    card.addEventListener('click', () => { window.location.href = produtoPageUrl; });
    rEl.appendChild(card);
  });
}

function showTab(tab) {
  const filterBar = document.getElementById('produtosFilterBar');
  Object.entries(tabPanes).forEach(([k, el]) => { if (!el) return; el.classList.toggle('hidden', k !== tab); el.classList.toggle('block', k === tab); });
  if (filterBar) filterBar.classList.toggle('hidden', tab !== 'produtos');
}

function carregarProdutos() {
  fetch('produtos.json').then(r => r.json()).then(data => {
    const arr = Array.isArray(data) ? data : [];
    const normalized = arr.map(normalizarProduto);
    const seen = new Set();
    produtosData = normalized.filter(p => { const k = String(p?.titulo || '').trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
    window.produtosData = produtosData;
    ordenarProdutos();
    renderProdutos();
    renderHomeSections();
  }).catch(e => { console.error(e); produtosData = []; window.produtosData = produtosData; renderProdutos(); renderHomeSections(); });
}

// ----- loja.json -----
function aplicarBannerLoja() {
  const div = document.getElementById('banner-loja');
  if (!div) return;
  div.style.display = (lojaState.banner_ativo && lojaState.banner) ? 'flex' : 'none';
}
function aplicarDadosLoja() {
  const nomeEl = document.getElementById('loja-nome');
  const logoEl = document.getElementById('loja-logo');
  if (nomeEl) nomeEl.textContent = lojaState.nome || lojaDefaults.nome;
  if (logoEl && lojaState.logo) { logoEl.onerror = () => { logoEl.onerror = null; logoEl.src = lojaDefaults.logo; }; logoEl.src = resolveMediaPath(lojaState.logo); }
  const apply = (id, v, fb) => { const el = document.getElementById(id); if (el) el.textContent = (typeof v === 'string' && v.trim()) ? v.trim() : (fb || ''); };
  apply('cartinha-titulo-topo', lojaState.cartinha_titulo_topo, lojaDefaults.cartinha_titulo_topo);
  apply('cartinha-desconto-texto', lojaState.cartinha_desconto_texto, lojaDefaults.cartinha_desconto_texto);
  apply('cartinha-subtitulo', lojaState.cartinha_subtitulo, lojaDefaults.cartinha_subtitulo);
  apply('cartinha-linha1', lojaState.cartinha_linha1, lojaDefaults.cartinha_linha1);
  apply('cartinha-linha2', lojaState.cartinha_linha2, lojaDefaults.cartinha_linha2);
  apply('cartinha-linha3', lojaState.cartinha_linha3, lojaDefaults.cartinha_linha3);
  apply('cartinha-timer-prefixo', lojaState.cartinha_timer_prefixo, lojaDefaults.cartinha_timer_prefixo);
  apply('btnResgatarCartinha', lojaState.cartinha_botao_texto, lojaDefaults.cartinha_botao_texto);
  const l4 = document.getElementById('cartinha-linha4');
  if (l4) {
    const t = (typeof lojaState.cartinha_linha4 === 'string' && lojaState.cartinha_linha4.trim()) ? lojaState.cartinha_linha4.trim() : (lojaDefaults.cartinha_linha4 || '');
    if (t) { l4.textContent = t; l4.style.display = 'block'; } else { l4.textContent = ''; l4.style.display = 'none'; }
  }
}
async function carregarLoja() {
  try {
    const r = await fetch('loja.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data && typeof data === 'object') {
      Object.assign(lojaState, {
        nome: data.nome || lojaDefaults.nome,
        descricao: data.descricao || '',
        logo: data.logo || null,
        logoUpdatedAt: data.logo_updated_at ?? null,
        cartinha_titulo_topo: data.cartinha_titulo_topo || '',
        cartinha_desconto_texto: data.cartinha_desconto_texto || '',
        cartinha_subtitulo: data.cartinha_subtitulo || '',
        cartinha_linha1: data.cartinha_linha1 || '',
        cartinha_linha2: data.cartinha_linha2 || '',
        cartinha_linha3: data.cartinha_linha3 || '',
        cartinha_linha4: data.cartinha_linha4 || '',
        cartinha_timer_prefixo: data.cartinha_timer_prefixo || '',
        cartinha_botao_texto: data.cartinha_botao_texto || '',
        banner_ativo: data.banner_ativo === true || data.banner_ativo === 1 || data.banner_ativo === '1',
        banner: data.banner || null
      });
    }
  } catch (e) { console.warn('loja.json:', e); }
  aplicarDadosLoja();
  aplicarBannerLoja();
}

// ----- modal cartinha 70% OFF -----
function abrirModalCartinha() { document.getElementById('modalCartinha').style.display = 'flex'; }
function fecharModalCartinha() { document.getElementById('modalCartinha').style.display = 'none'; }
function resgatarCartinha() { fecharModalCartinha(); showCenterToast('Desconto de 70% aplicado em produtos selecionados!', 'success', 2200); }

(function(){
  let total = 24*60*60;
  const el = document.getElementById('modalCartinhaCountdown');
  if (!el) return;
  (function tick(){
    if (total <= 0) return;
    const h = Math.floor(total/3600).toString().padStart(2,'0');
    const m = Math.floor((total%3600)/60).toString().padStart(2,'0');
    const s = (total%60).toString().padStart(2,'0');
    el.textContent = h+':'+m+':'+s;
    total--; setTimeout(tick, 1000);
  })();
})();
(function(){
  if (!sessionStorage.getItem('modalCartinhaVisto')) {
    setTimeout(abrirModalCartinha, 1200);
    sessionStorage.setItem('modalCartinhaVisto','1');
  }
})();

// ----- bootstrap -----
document.addEventListener('DOMContentLoaded', () => {
  productsContainer = document.getElementById('products');
  toggleIconRef = document.getElementById('toggleIcon');
  precoIconRef = document.getElementById('precoIcon');
  toggleBtnRef = document.getElementById('toggleView');
  tabPanes = {
    inicio: document.getElementById('tab-inicio'),
    produtos: document.getElementById('tab-produtos'),
    categorias: document.getElementById('tab-categorias'),
  };
  carregarLoja();

  // image viewer
  const viewer = document.getElementById('imageViewer');
  const viewerContent = document.getElementById('imageViewerContent');
  document.getElementById('imageViewerClose')?.addEventListener('click', closeImageViewer);
  document.querySelector('#imageViewer .image-viewer-backdrop')?.addEventListener('click', closeImageViewer);
  document.getElementById('imageViewerPrev')?.addEventListener('click', () => showImageViewerIndex(galleryIndex - 1));
  document.getElementById('imageViewerNext')?.addEventListener('click', () => showImageViewerIndex(galleryIndex + 1));
  viewerContent?.addEventListener('touchstart', e => { if (e.touches?.length === 1) galleryTouchStartX = e.touches[0].clientX; }, { passive: true });
  viewerContent?.addEventListener('touchend', e => {
    if (galleryTouchStartX === null) return;
    const endX = e.changedTouches[0].clientX;
    const d = endX - galleryTouchStartX;
    if (Math.abs(d) > 40 && galleryImages.length > 1) showImageViewerIndex(galleryIndex + (d < 0 ? 1 : -1));
    galleryTouchStartX = null;
  });
  document.addEventListener('keydown', e => {
    if (!viewer?.classList.contains('show')) return;
    if (e.key === 'Escape') closeImageViewer();
    if (e.key === 'ArrowLeft') showImageViewerIndex(galleryIndex - 1);
    if (e.key === 'ArrowRight') showImageViewerIndex(galleryIndex + 1);
  });

  renderCarrinho();
  carregarProdutos();
  initFreteCountdown();
  updateFreteProgress();

  document.getElementById('freteResgateBtn')?.addEventListener('click', () => {
    if (getCartTotal() < FRETE_META) { showCenterToast('Adicione mais produtos para liberar o frete gratis.', 'info', 2000); return; }
    localStorage.setItem('freteGratisResgatado', '1');
    showCenterToast('Frete gratis liberado! Sera aplicado no checkout.', 'success', 2200);
    updateFreteProgress();
  });

  showTab('produtos');

  if (toggleIconRef) toggleIconRef.className = isGrid ? 'fas fa-th-large' : 'fas fa-list';
  toggleBtnRef?.addEventListener('click', () => {
    isGrid = !isGrid;
    if (toggleIconRef) toggleIconRef.className = isGrid ? 'fas fa-th-large' : 'fas fa-list';
    renderProdutos();
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.getAttribute('data-filter') || 'recomendado';
      if (f === 'preco') {
        currentFilter = 'preco'; ordenarProdutos();
        document.querySelectorAll('.filter-btn').forEach(el => el.classList.toggle('active', el.getAttribute('data-filter') === 'preco'));
        renderProdutos(); showCenterToast('Ordenando por preço: maior para menor.', 'info', 1700); return;
      }
      currentFilter = f;
      document.querySelectorAll('.filter-btn').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      renderProdutos();
    });
  });

  // seguir
  const seguirBtn = document.getElementById('seguirBtn');
  if (seguirBtn) {
    const sync = () => {
      const seguindo = localStorage.getItem('lojaSeguindo') === '1';
      seguirBtn.textContent = seguindo ? 'Seguindo' : 'Seguir';
      if (seguindo) {
        seguirBtn.style.setProperty('background', 'rgba(224,224,224,0.65)', 'important');
        seguirBtn.style.setProperty('color', '#374151', 'important');
        seguirBtn.style.setProperty('border', '1px solid #dcdcdc', 'important');
      } else {
        seguirBtn.style.setProperty('background', '#e11d48', 'important');
        seguirBtn.style.setProperty('color', '#fff', 'important');
        seguirBtn.style.setProperty('border', 'none', 'important');
      }
    };
    sync();
    seguirBtn.addEventListener('click', () => {
      if (localStorage.getItem('lojaSeguindo') === '1') return;
      localStorage.setItem('lojaSeguindo', '1');
      showCenterToast('Você agora segue a loja.', 'success');
      sync();
    });
  }

  // cupons
  const resgatados = new Set(JSON.parse(localStorage.getItem('cuponsResgatados') || '[]'));
  const marcar = (btn) => {
    btn.textContent = 'Resgatado'; btn.disabled = true;
    btn.style.setProperty('background', '#e5e7eb', 'important');
    btn.style.setProperty('color', '#374151', 'important');
    btn.style.setProperty('border', '1px solid #d1d5db', 'important');
  };
  document.querySelectorAll('.resgatar-btn').forEach(btn => {
    const code = btn.dataset.code || 'CUPOM';
    if (resgatados.has(code)) marcar(btn);
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
        else {
          const t = document.createElement('textarea'); t.value = code; t.style.position='fixed'; t.style.left='-9999px';
          document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
        }
        resgatados.add(code);
        localStorage.setItem('cuponsResgatados', JSON.stringify([...resgatados]));
        marcar(btn);
        showCenterToast(`Cupom "${code}" copiado!`, 'success');
      } catch { showCenterToast('Não foi possível copiar o cupom.', 'error'); }
    });
  });

  // abas
  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      showTab(btn.getAttribute('data-tab') || 'produtos');
    });
  });
  document.getElementById('homeVerMaisBtn')?.addEventListener('click', () => {
    const pb = document.querySelector('.tab-item[data-tab="produtos"]');
    if (pb) { document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active')); pb.classList.add('active'); }
    showTab('produtos');
    const m = document.getElementById('menuWrapper');
    window.scrollTo({ top: (m ? m.offsetTop : 0) - 8, behavior: 'smooth' });
  });

  // menu sticky
  const menuWrapper = document.getElementById('menuWrapper');
  const menuSpacer = document.getElementById('menuSpacer');
  const menuHeight = menuWrapper ? menuWrapper.offsetHeight : 0;
  window.addEventListener('scroll', () => {
    if (!menuWrapper || !menuSpacer) return;
    if (window.scrollY >= 120) {
      menuWrapper.classList.add('fixed-menu', 'top-[53px]', 'bg-white', 'shadow-sm');
      menuSpacer.style.height = `${menuHeight}px`;
    } else {
      menuWrapper.classList.remove('fixed-menu', 'top-[53px]', 'shadow-sm');
      menuSpacer.style.height = '0px';
    }
  });
});

window.abrirModalCartinha = abrirModalCartinha;
window.fecharModalCartinha = fecharModalCartinha;
window.resgatarCartinha = resgatarCartinha;
window.abrirCarrinho = abrirCarrinho;
window.fecharCarrinho = fecharCarrinho;
window.fecharModal = fecharModal;
window.comprarAgora = comprarAgora;
window.abrirModalProduto = abrirModalProduto;
window.finalizarCompra = finalizarCompra;
