// Ficha de Produção — J J Marmorite
// Front-end puro (sem framework). Fala com o backend (FastAPI + SQLite) pela
// API em /api/*. Nenhum dado de negócio mora aqui — só UI e parsing de arquivo.

let produtos = [];
let historico = [];
let ultimoCalculo = null;
let ultimosItensCalculo = null;
let inputMode = 'file';

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function fmtMoney(v){
  return v.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
function fmtDateShort(iso){
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'});
}
function normalizeCode(raw){
  let s = String(raw==null?'':raw).trim();
  if(/^\d+$/.test(s)){
    s = s.padStart(4, '0');
  }
  return s.toUpperCase();
}

// ---------- API ----------
async function apiCall(path, options){
  let res;
  try{
    res = await fetch('/api'+path, options);
  }catch(e){
    throw new Error('Não consegui falar com o servidor. Confere se o backend (uvicorn) está rodando.');
  }
  if(!res.ok){
    let msg = 'Erro ao chamar '+path;
    try{ const body = await res.json(); if(body.detail) msg = body.detail; }catch(e){}
    throw new Error(msg);
  }
  if(res.status === 204) return null;
  return res.json();
}
const api = {
  getProdutos: () => apiCall('/produtos'),
  upsertProduto: (p) => apiCall('/produtos', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(p)}),
  updateProduto: (codigoOriginal, p) => apiCall('/produtos/'+encodeURIComponent(codigoOriginal), {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(p)}),
  deleteProduto: (codigo) => apiCall('/produtos/'+encodeURIComponent(codigo), {method:'DELETE'}),
  restaurarProdutos: () => apiCall('/produtos/restaurar', {method:'POST'}),
  calcular: (itens) => apiCall('/recibos/calcular', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({itens})}),
  salvarRecibo: (payload) => apiCall('/recibos', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}),
  getRecibos: () => apiCall('/recibos'),
  limparHistorico: () => apiCall('/recibos', {method:'DELETE'}),
  editarRecibo: (id, payload) => apiCall('/recibos/'+id, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}),
  excluirRecibo: (id) => apiCall('/recibos/'+id, {method:'DELETE'}),
  renomearEncomenda: (de, para) => apiCall('/encomendas/renomear', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({de, para})}),
  moverParaEncomenda: (ids, encomenda) => apiCall('/encomendas/mover', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids, encomenda})}),
  listarDiarias: (encomenda) => apiCall('/diarias'+(encomenda?'?encomenda='+encodeURIComponent(encomenda):'')),
  criarDiaria: (payload) => apiCall('/diarias', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}),
  editarDiaria: (id, payload) => apiCall('/diarias/'+id, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}),
  excluirDiaria: (id) => apiCall('/diarias/'+id, {method:'DELETE'}),
};

// ---------- tabs ----------
$$('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.tab-btn').forEach(b=>b.classList.remove('active'));
    $$('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    $('#panel-'+btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab==='historico') renderHistorico();
    if(btn.dataset.tab==='produtos') renderProdutosTable();
  });
});

// ---------- mode toggle ----------
$('#mode-file-btn').addEventListener('click', ()=>{
  inputMode='file';
  $('#mode-file-btn').classList.add('active');
  $('#mode-text-btn').classList.remove('active');
  $('#mode-file').style.display='';
  $('#mode-text').style.display='none';
});
$('#mode-text-btn').addEventListener('click', ()=>{
  inputMode='text';
  $('#mode-text-btn').classList.add('active');
  $('#mode-file-btn').classList.remove('active');
  $('#mode-text').style.display='';
  $('#mode-file').style.display='none';
});

// ---------- file upload ----------
let parsedFileItems = null;
const dropzone = $('#dropzone');
const fileInput = $('#file-input');
dropzone.addEventListener('click', ()=>fileInput.click());
dropzone.addEventListener('dragover', e=>{e.preventDefault(); dropzone.classList.add('drag');});
dropzone.addEventListener('dragleave', ()=>dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', e=>{
  e.preventDefault(); dropzone.classList.remove('drag');
  if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e=>{
  if(e.target.files[0]) handleFile(e.target.files[0]);
});

function handleFile(file){
  const status = $('#file-status');
  status.innerHTML = '<div class="alert alert-ok"><span class="spinner"></span> Lendo '+file.name+'...</div>';
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array'});
      let found = null;
      for(const sheetName of wb.SheetNames){
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {header:1, defval:null});
        const items = extractItemsFromRows(rows);
        if(items && items.length){ found = items; break; }
      }
      if(!found || !found.length){
        status.innerHTML = '<div class="alert alert-error">⚠ Não encontrei colunas de "Código" e "Quantidade" nesse arquivo. Tenta o modo "Digitar / colar" para esse recibo.</div>';
        parsedFileItems = null;
        return;
      }
      parsedFileItems = found;
      status.innerHTML = '<div class="alert alert-ok">✓ '+found.length+' itens lidos de <b>'+file.name+'</b>. Clique em "Calcular valor".</div>';
    }catch(err){
      console.error(err);
      status.innerHTML = '<div class="alert alert-error">⚠ Não consegui ler esse arquivo. Confere se é um .xlsx válido, ou usa o modo "Digitar / colar".</div>';
      parsedFileItems = null;
    }
  };
  reader.onerror = ()=>{
    status.innerHTML = '<div class="alert alert-error">⚠ Falha ao abrir o arquivo.</div>';
  };
  reader.readAsArrayBuffer(file);
}

// Remove acentos (marcas de combinação Unicode 0300–036F) depois de normalize('NFD').
const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');
function normHeader(v){
  return String(v==null?'':v).trim().toLowerCase()
    .normalize('NFD').replace(DIACRITICS_RE,'');
}

function extractItemsFromRows(rows){
  let headerRow = -1, codeCol = -1, qtyCol = -1;
  for(let r=0;r<rows.length;r++){
    const row = rows[r] || [];
    let c = -1, q = -1;
    for(let c2=0;c2<row.length;c2++){
      const h = normHeader(row[c2]);
      if(h==='codigo' || h==='cod.' || h==='cod') c = c2;
      if(h==='quantidade' || h==='qtd' || h==='qtde') q = c2;
    }
    if(c>-1 && q>-1){ headerRow=r; codeCol=c; qtyCol=q; break; }
  }
  if(headerRow===-1) return null;
  const items = [];
  for(let r=headerRow+1; r<rows.length; r++){
    const row = rows[r] || [];
    const codeRaw = row[codeCol];
    const qtyRaw = row[qtyCol];
    if(codeRaw==null || String(codeRaw).trim()===''){
      // allow blank rows in between, but stop after too many empties in a row
      continue;
    }
    if(normHeader(codeRaw)==='total') continue;
    const qty = parseFloat(qtyRaw);
    if(isNaN(qty)) continue;
    items.push({codigo: normalizeCode(codeRaw), quantidade: qty});
  }
  return items;
}

// ---------- text parsing ----------
function extractItemsFromText(text){
  const items = [];
  const lines = text.split('\n');
  for(const line of lines){
    const t = line.trim();
    if(!t) continue;
    const parts = t.split(/[,;\t]+|\s{2,}|(?<=\d)\s+(?=\d)/).map(p=>p.trim()).filter(Boolean);
    let finalParts = parts;
    if(parts.length < 2){
      finalParts = t.split(/\s+/).filter(Boolean);
    }
    if(finalParts.length < 2) continue;
    const codigo = finalParts[0];
    const qty = parseFloat(finalParts[finalParts.length-1].replace(',', '.'));
    if(isNaN(qty)) continue;
    items.push({codigo: normalizeCode(codigo), quantidade: qty});
  }
  return items;
}

// ---------- calculate ----------
$('#btn-calcular').addEventListener('click', async ()=>{
  const alertArea = $('#calc-alert-area');
  alertArea.innerHTML = '';
  let items = [];
  if(inputMode==='file'){
    if(!parsedFileItems){
      alertArea.innerHTML = '<div class="alert alert-warn">Escolhe um arquivo .xlsx primeiro.</div>';
      return;
    }
    items = parsedFileItems;
  }else{
    const text = $('#text-input').value;
    items = extractItemsFromText(text);
    if(!items.length){
      alertArea.innerHTML = '<div class="alert alert-warn">Não encontrei nenhuma linha válida. Formato: código e quantidade, um por linha (ex: 0623, 10).</div>';
      return;
    }
  }
  await calcularRecibo(items);
});

async function calcularRecibo(items){
  let calc;
  try{
    calc = await api.calcular(items);
  }catch(e){
    $('#calc-alert-area').innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>';
    return;
  }

  const dataInput = $('#receipt-date').value; // '' ou 'AAAA-MM-DD'
  ultimoCalculo = {
    data: dataInput ? new Date(dataInput+'T00:00:00').toISOString() : new Date().toISOString(),
    dataInput: dataInput || null, // o que manda pro backend ao salvar — null = usa "agora"
    nota: $('#receipt-note').value.trim(),
    encomenda: $('#receipt-encomenda').value.trim(),
    itens: calc.itens,
    total: calc.total,
    qtdTotal: calc.qtd_total,
  };
  ultimosItensCalculo = items;

  renderResultado(ultimoCalculo, calc.faltando);
}

function renderResultado(calc, faltando){
  const area = $('#result-area');
  let html = '<div class="receipt"><div class="perf"></div>';
  html += '<div class="receipt-head">';
  html += '<p class="rtitle">Recibo calculado</p>';
  html += '<p class="rdate">'+fmtDateShort(calc.data)+(calc.nota ? ' · '+escapeHtml(calc.nota) : '')+'</p>';
  html += '</div>';
  html += '<div class="receipt-list">';
  calc.itens.forEach(it=>{
    if(it.ok){
      html += '<div class="ritem">'
        + '<span class="icode">'+it.codigo+'</span>'
        + '<span class="iname">'+escapeHtml(it.nome)+'</span>'
        + '<span class="ileader"></span>'
        + '<span class="iqty">'+it.quantidade+'×'+it.preco.toFixed(2)+'</span>'
        + '<span class="ival">'+fmtMoney(it.subtotal)+'</span>'
        + '</div>';
    }else{
      html += '<div class="ritem missing">'
        + '<span class="icode">'+it.codigo+'</span>'
        + '<span class="iname">código não encontrado na tabela</span>'
        + '<span class="ileader"></span>'
        + '<span class="iqty">'+it.quantidade+'×</span>'
        + '<button class="btn-cadastrar-mini" data-codigo="'+escapeAttr(it.codigo)+'">+ cadastrar</button>'
        + '</div>';
    }
  });
  html += '</div>';
  html += '<div class="receipt-total"><span class="tlabel">Total a receber</span><span class="tvalue">'+fmtMoney(calc.total)+'</span></div>';
  html += '<div class="receipt-foot">';
  html += '<span class="badge-stamp">'+calc.qtdTotal+' peças</span>';
  html += '<button class="btn btn-ghost btn-sm" id="btn-compartilhar-recibo">Compartilhar</button>';
  html += '<button class="btn btn-primary btn-sm" id="btn-salvar-recibo">Salvar no histórico</button>';
  html += '</div></div>';

  if(faltando.length){
    html = '<div class="alert alert-error" style="margin-top:16px;">⚠ '+faltando.length+' código(s) não encontrado(s) na tabela de preços: <b>'+faltando.join(', ')+'</b>. Clique em "+ cadastrar" ao lado do item, ou cadastre na aba "Tabela de preços" — eles não entraram no total ainda.</div>' + html;
  }

  area.innerHTML = html;
  const saveBtn = $('#btn-salvar-recibo');
  if(saveBtn) saveBtn.addEventListener('click', salvarRecibo);
  const shareBtn = $('#btn-compartilhar-recibo');
  if(shareBtn) shareBtn.addEventListener('click', ()=>shareRecibo(calc));
  $$('.btn-cadastrar-mini', area).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const codigo = btn.dataset.codigo;
      openAddProdutoModal(codigo, async ()=>{
        if(ultimosItensCalculo) await calcularRecibo(ultimosItensCalculo);
      });
    });
  });
}

async function salvarRecibo(){
  if(!ultimoCalculo) return;
  const btnAntes = $('#btn-salvar-recibo');
  if(btnAntes){ btnAntes.disabled = true; btnAntes.textContent = 'Salvando...'; }
  const area = $('#result-area');
  try{
    const salvo = await api.salvarRecibo({
      nota: ultimoCalculo.nota,
      encomenda: ultimoCalculo.encomenda,
      itens: ultimoCalculo.itens,
      total: ultimoCalculo.total,
      qtd_total: ultimoCalculo.qtdTotal,
      data: ultimoCalculo.dataInput,
    });
    historico.unshift({
      id: salvo.id, data: salvo.data, nota: salvo.nota, encomenda: salvo.encomenda,
      itens: salvo.itens, total: salvo.total, qtdTotal: salvo.qtd_total,
    });
    // `innerHTML +=` reconstrói os nós filhos, então o botão precisa ser
    // consultado de novo depois disso — a referência antiga fica órfã.
    area.innerHTML += '<div class="alert alert-ok" style="margin-top:10px;">✓ Recibo salvo no histórico.</div>';
    const btnDepois = $('#btn-salvar-recibo');
    if(btnDepois){ btnDepois.disabled = true; btnDepois.textContent = 'Salvo ✓'; }
  }catch(e){
    area.innerHTML += '<div class="alert alert-error" style="margin-top:10px;">⚠ '+escapeHtml(e.message)+'</div>';
    const btnDepois = $('#btn-salvar-recibo');
    if(btnDepois){ btnDepois.disabled = false; btnDepois.textContent = 'Salvar no histórico'; }
  }
}

$('#btn-limpar').addEventListener('click', ()=>{
  parsedFileItems = null;
  $('#text-input').value = '';
  $('#file-status').innerHTML = '';
  $('#receipt-note').value = '';
  $('#receipt-encomenda').value = '';
  $('#receipt-date').value = '';
  $('#calc-alert-area').innerHTML = '';
  $('#result-area').innerHTML = '';
  ultimoCalculo = null;
});

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ---------- produtos tab ----------
function renderProdutosTable(filter){
  const tbody = $('#produtos-tbody');
  const q = (filter||$('#produto-search').value||'').trim().toLowerCase();
  const list = produtos
    .map((p,i)=>({p,i}))
    .filter(({p}) => !q || p.codigo.toLowerCase().includes(q) || p.nome.toLowerCase().includes(q));

  if(!list.length){
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty"><div class="eicon">🔍</div><div class="etitle">Nada encontrado</div><div class="esub">Tenta outro código ou nome.</div></div></td></tr>';
  }else{
    tbody.innerHTML = list.map(({p,i})=>{
      return '<tr data-idx="'+i+'">'
        + '<td class="tcode"><input type="text" value="'+escapeAttr(p.codigo)+'" data-field="codigo"></td>'
        + '<td><input type="text" value="'+escapeAttr(p.nome)+'" data-field="nome"></td>'
        + '<td class="tprice"><input type="text" value="'+p.preco.toFixed(2)+'" data-field="preco"></td>'
        + '<td><button class="del-btn" title="Remover">✕</button></td>'
        + '</tr>';
    }).join('');
  }
  $('#produtos-count').textContent = produtos.length + ' produtos cadastrados';

  $$('input', tbody).forEach(inp=>{
    inp.addEventListener('change', onProdutoFieldChange);
  });
  $$('.del-btn', tbody).forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const idx = parseInt(e.target.closest('tr').dataset.idx);
      confirmModal('Remover produto?', 'Isso remove "'+produtos[idx].nome+'" da tabela de preços. Você pode desfazer restaurando a tabela original depois.', async ()=>{
        try{
          await api.deleteProduto(produtos[idx].codigo);
          produtos.splice(idx,1);
          renderProdutosTable();
        }catch(e){
          $('#produtos-alert').innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>';
        }
      });
    });
  });
}

async function onProdutoFieldChange(e){
  const tr = e.target.closest('tr');
  const idx = parseInt(tr.dataset.idx);
  const field = e.target.dataset.field;
  const codigoOriginal = produtos[idx].codigo;
  let val = e.target.value.trim();
  if(field==='preco'){
    val = parseFloat(val.replace(',','.'));
    if(isNaN(val) || val < 0){
      $('#produtos-alert').innerHTML = '<div class="alert alert-warn">Preço inválido — mantive o valor anterior.</div>';
      renderProdutosTable();
      return;
    }
  }
  if(field==='codigo') val = normalizeCode(val);

  const atualizado = {...produtos[idx], [field]: val};
  try{
    const salvo = await api.updateProduto(codigoOriginal, atualizado);
    produtos[idx] = salvo;
    $('#produtos-alert').innerHTML = '';
    renderProdutosTable();
  }catch(e){
    $('#produtos-alert').innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>';
    renderProdutosTable();
  }
}

$('#produto-search').addEventListener('input', (e)=>renderProdutosTable(e.target.value));

$('#btn-add-produto').addEventListener('click', ()=>{
  openAddProdutoModal(null, async ()=>{
    $('#produto-search').value='';
    produtos = await api.getProdutos();
    renderProdutosTable();
  });
});

$('#btn-restaurar-catalogo').addEventListener('click', ()=>{
  confirmModal('Restaurar tabela original?', 'Isso substitui a tabela de preços atual pelo catálogo original. Suas edições manuais serão perdidas.', async ()=>{
    try{
      produtos = await api.restaurarProdutos();
      renderProdutosTable();
    }catch(e){
      $('#produtos-alert').innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>';
    }
  });
});

function escapeAttr(s){
  return String(s).replace(/"/g,'&quot;');
}

// ---------- cadastro rápido de produto (modal) ----------
function openAddProdutoModal(prefillCodigo, onAdded){
  const existente = prefillCodigo ? produtos.find(p=>normalizeCode(p.codigo)===normalizeCode(prefillCodigo)) : null;
  const html = '<div class="modal-back" id="add-produto-back"><div class="modal">'
    + '<h3>'+(existente ? 'Atualizar produto' : 'Cadastrar produto')+'</h3>'
    + '<p>'+(prefillCodigo ? 'Código <b>'+escapeHtml(normalizeCode(prefillCodigo))+'</b> não estava na tabela. Preenche o nome e o preço.' : 'Adiciona um novo item na tabela de preços.')+'</p>'
    + '<div class="field"><label class="field-label">Código</label><input type="text" id="ap-codigo" value="'+escapeAttr(prefillCodigo?normalizeCode(prefillCodigo):(existente?existente.codigo:''))+'" '+(prefillCodigo?'readonly':'')+'></div>'
    + '<div class="field"><label class="field-label">Nome do produto</label><input type="text" id="ap-nome" value="'+escapeAttr(existente?existente.nome:'')+'" placeholder="Ex: Buda Nepal Proteção G"></div>'
    + '<div class="field"><label class="field-label">Preço (R$)</label><input type="text" id="ap-preco" value="'+(existente?existente.preco.toFixed(2):'')+'" placeholder="Ex: 6.25"></div>'
    + '<div id="ap-alert"></div>'
    + '<div class="row-actions"><button class="btn btn-ghost" id="ap-cancel">Cancelar</button><button class="btn btn-primary" id="ap-salvar" style="margin-left:auto;">'+(existente?'Atualizar':'Cadastrar')+'</button></div>'
    + '</div></div>';
  $('#modal-root').innerHTML = html;
  $('#add-produto-back').addEventListener('click', (e)=>{ if(e.target.id==='add-produto-back') $('#modal-root').innerHTML=''; });
  $('#ap-cancel').addEventListener('click', ()=>{ $('#modal-root').innerHTML=''; });
  if(!prefillCodigo) $('#ap-codigo').focus(); else $('#ap-nome').focus();

  $('#ap-salvar').addEventListener('click', async ()=>{
    const codigo = normalizeCode($('#ap-codigo').value);
    const nome = $('#ap-nome').value.trim();
    const precoRaw = $('#ap-preco').value.trim().replace(',', '.');
    const preco = parseFloat(precoRaw);
    const alertEl = $('#ap-alert');
    if(!codigo){
      alertEl.innerHTML = '<div class="alert alert-warn">Informe o código.</div>'; return;
    }
    if(!nome){
      alertEl.innerHTML = '<div class="alert alert-warn">Informe o nome do produto.</div>'; return;
    }
    if(isNaN(preco) || preco < 0){
      alertEl.innerHTML = '<div class="alert alert-warn">Informe um preço válido.</div>'; return;
    }
    const idxExistente = produtos.findIndex(p=>normalizeCode(p.codigo)===codigo);
    let salvo;
    try{
      salvo = await api.upsertProduto({codigo, nome, preco});
    }catch(e){
      alertEl.innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>';
      return;
    }
    if(idxExistente > -1){
      produtos[idxExistente] = salvo;
    }else{
      produtos.unshift(salvo);
    }
    $('#modal-root').innerHTML = '';
    showToast((idxExistente>-1?'Produto atualizado: ':'Produto cadastrado: ')+salvo.codigo+' — '+salvo.nome);
    if(typeof onAdded === 'function') onAdded(salvo);
  });
}

// ---------- toast ----------
let toastTimer = null;
function showToast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove('show'), 2600);
}

// ---------- compartilhar recibo ----------
function buildShareText(calc){
  const lines = [];
  lines.push('🧾 Recibo de Produção — J J Marmorite');
  lines.push((calc.nota ? calc.nota+' · ' : '') + fmtDateShort(calc.data));
  lines.push('');
  calc.itens.forEach(it=>{
    if(it.ok){
      lines.push(it.codigo+' '+it.nome+' — '+it.quantidade+'x '+fmtMoney(it.preco)+' = '+fmtMoney(it.subtotal));
    }else{
      lines.push(it.codigo+' (não cadastrado) — '+it.quantidade+'x');
    }
  });
  lines.push('');
  lines.push('Total: '+fmtMoney(calc.total)+' ('+calc.qtdTotal+' peças)');
  return lines.join('\n');
}

async function shareRecibo(calc){
  const text = buildShareText(calc);
  if(navigator.share){
    try{
      await navigator.share({title:'Recibo de Produção', text});
      return;
    }catch(e){
      if(e && e.name==='AbortError') return; // usuário cancelou
      // se falhar por outro motivo, cai pro clipboard abaixo
    }
  }
  try{
    await navigator.clipboard.writeText(text);
    showToast('Recibo copiado — cola no WhatsApp, e-mail, etc.');
  }catch(e){
    showToast('Não consegui copiar automaticamente. Selecione o texto manualmente.');
  }
}

// ---------- historico tab ----------
async function renderHistorico(){
  const el = $('#historico-content');
  if(!historico.length){
    el.innerHTML = '<div class="card"><div class="empty"><div class="eicon">🧾</div><div class="etitle">Nenhum recibo salvo ainda</div><div class="esub">Calcule um recibo na aba "Calcular" e clique em "Salvar no histórico".</div></div></div>';
    return;
  }

  let diarias = [];
  try{
    diarias = await api.listarDiarias();
  }catch(e){
    console.warn('erro ao carregar diárias:', e);
  }

  // Agrupa diárias por encomenda
  const diariasPos = new Map();
  diarias.forEach(d=>{
    const chave = d.encomenda;
    if(!diariasPos.has(chave)) diariasPos.set(chave, []);
    diariasPos.get(chave).push(d);
  });
  const totalGeral = historico.reduce((s,h)=>s+h.total,0);
  const totalPecas = historico.reduce((s,h)=>s+h.qtdTotal,0);

  const now = new Date();
  const thisMonth = historico.filter(h=>{
    const d = new Date(h.data);
    return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
  });
  const totalMes = thisMonth.reduce((s,h)=>s+h.total,0);

  let html = '<div class="summary-strip">';
  html += '<div class="summary-box"><div class="slabel">Este mês</div><div class="sval">'+fmtMoney(totalMes)+'</div></div>';
  html += '<div class="summary-box"><div class="slabel">Total acumulado</div><div class="sval">'+fmtMoney(totalGeral)+'</div></div>';
  html += '<div class="summary-box"><div class="slabel">Peças no total</div><div class="sval">'+totalPecas+'</div></div>';
  html += '</div>';

  // ---- agrupa por encomenda ----
  // chave null = recibos avulsos, sem encomenda. Guarda o índice original de
  // `historico` em cada item, é o que abrirDetalheHistorico() espera.
  const grupos = new Map();
  historico.forEach((h, idx)=>{
    const chave = h.encomenda || null;
    if(!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push({h, idx});
  });
  const semEncomenda = grupos.get(null) || [];
  grupos.delete(null);
  // grupos nomeados primeiro, ordenados pelo recibo mais recente de cada um
  const gruposNomeados = [...grupos.entries()].sort((a, b)=>{
    const maisRecente = arr => Math.max(...arr.map(({h})=>new Date(h.data).getTime()));
    return maisRecente(b[1]) - maisRecente(a[1]);
  });

  function renderGrupo(nome, itens){
    const totalGrupo = itens.reduce((s,{h})=>s+h.total, 0);
    const pecasGrupo = itens.reduce((s,{h})=>s+h.qtdTotal, 0);
    const diariasDaEncomenda = (nome && diariasPos.has(nome)) ? diariasPos.get(nome) : [];
    const totalDiarias = diariasDaEncomenda.reduce((s,d)=>s+d.valor, 0);

    let g = '<div class="card" style="padding:14px 14px 16px;">';
    g += '<div class="encomenda-head"><h3 class="encomenda-title">'+(nome?escapeHtml(nome):'Recibos sem encomenda')+'</h3>'
      + '<span class="encomenda-count">'+itens.length+' recibo'+(itens.length!==1?'s':'')+'</span></div>';

    // Recibos
    itens.forEach(({h, idx})=>{
      g += '<div class="hist-item" data-idx="'+idx+'">'
        + '<input type="checkbox" class="sel-recibo" data-idx="'+idx+'">'
        + '<div class="hleft"><div class="hdate">'+fmtDateShort(h.data)+'</div><div class="hnote">'+(h.nota?escapeHtml(h.nota):'Recibo sem nota')+'</div></div>'
        + '<div class="hright"><div class="hval">'+fmtMoney(h.total)+'</div><div class="hqty">'+h.qtdTotal+' peças</div></div>'
        + '</div>';
    });

    // Diárias
    if(nome){
      if(diariasDaEncomenda.length){
        g += '<div class="diarias-section">';
        g += '<div class="diarias-title">Diárias</div>';
        diariasDaEncomenda.forEach(d=>{
          g += '<div class="diaria-item" data-diaria-id="'+d.id+'">'
            + '<div class="dleft"><div class="ddata">'+(d.data?fmtDateShort(d.data):'sem data')+'</div><div class="dcomentario">'+(d.comentario?escapeHtml(d.comentario):'sem comentário')+'</div></div>'
            + '<div class="dright"><div class="dval">'+fmtMoney(d.valor)+'</div></div>'
            + '</div>';
        });
        g += '</div>';
      }
      g += '<div class="btn-add-diaria-wrapper"><button class="btn btn-ghost btn-sm btn-add-diaria" data-encomenda="'+escapeAttr(nome)+'">+ Adicionar diária</button></div>';
    }

    g += '<div class="encomenda-foot"><div class="encomenda-foot-stats">'
      + '<span><b>'+pecasGrupo+'</b> peças</span>'
      + '<span class="efoot-total">'+fmtMoney(totalGrupo)+' recibos</span>';
    if(totalDiarias > 0){
      g += '<span class="efoot-diarias">+ '+fmtMoney(totalDiarias)+' diárias</span>';
    }
    g += '</div>';
    if(nome){
      g += '<button class="btn btn-ghost btn-sm btn-alterar-encomenda" data-nome="'+escapeAttr(nome)+'">Alterar</button>';
    }
    g += '</div></div>';
    return g;
  }

  // Barra de mover em lote — fica escondida até algum recibo ser marcado.
  const nomesExistentes = gruposNomeados.map(([nome])=>nome);
  html += '<div class="sel-bar" id="sel-bar" style="display:none;">'
    + '<span id="sel-count"></span>'
    + '<input type="text" id="sel-destino" list="encomenda-suggestions" placeholder="Nome da encomenda de destino">'
    + '<datalist id="encomenda-suggestions">'+nomesExistentes.map(n=>'<option value="'+escapeAttr(n)+'">').join('')+'</datalist>'
    + '<button class="btn btn-primary btn-sm" id="sel-imprimir">🖨 Imprimir</button>'
    + '<button class="btn btn-primary btn-sm" id="sel-mover">Mover selecionados</button>'
    + '<button class="btn btn-ghost btn-sm" id="sel-cancelar">Cancelar seleção</button>'
    + '</div>';

  gruposNomeados.forEach(([nome, itens])=>{ html += renderGrupo(nome, itens); });
  if(semEncomenda.length) html += renderGrupo(null, semEncomenda);

  html += '<div class="row-actions"><button class="btn btn-danger btn-sm" id="btn-limpar-historico">Limpar todo o histórico</button></div>';

  el.innerHTML = html;

  function atualizarBarraSelecao(){
    const marcados = $$('.sel-recibo:checked', el);
    const bar = $('#sel-bar');
    if(marcados.length){
      bar.style.display = '';
      $('#sel-count').textContent = marcados.length+' selecionado'+(marcados.length!==1?'s':'');
    }else{
      bar.style.display = 'none';
    }
  }

  $$('.hist-item', el).forEach(item=>{
    item.addEventListener('click', (e)=>{
      if(e.target.classList.contains('sel-recibo')) return; // marcar checkbox não abre o detalhe
      const idx = parseInt(item.dataset.idx);
      abrirDetalheHistorico(historico[idx], idx);
    });
  });
  $$('.sel-recibo', el).forEach(cb=>{
    cb.addEventListener('click', e=>e.stopPropagation());
    cb.addEventListener('change', atualizarBarraSelecao);
  });
  $$('.btn-alterar-encomenda', el).forEach(btn=>{
    btn.addEventListener('click', ()=>abrirRenomearEncomenda(btn.dataset.nome));
  });
  $('#sel-cancelar').addEventListener('click', ()=>{
    $$('.sel-recibo', el).forEach(cb=>cb.checked=false);
    atualizarBarraSelecao();
  });
  $('#sel-imprimir').addEventListener('click', ()=>{
    const marcados = $$('.sel-recibo:checked', el);
    if(!marcados.length) return;
    const ids = marcados.map(cb => historico[parseInt(cb.dataset.idx)].id);
    imprimirSelecionados(ids);
  });
  $('#sel-mover').addEventListener('click', ()=>{
    const marcados = $$('.sel-recibo:checked', el);
    const alertHost = $('#sel-bar');
    if(!marcados.length) return;
    const destino = $('#sel-destino').value.trim();
    if(!destino){
      alertHost.insertAdjacentHTML('afterend', '<div class="alert alert-warn">Informe pra qual encomenda mover.</div>');
      return;
    }
    const ids = marcados.map(cb => historico[parseInt(cb.dataset.idx)].id);
    // Sistema de segurança: mover em lote também pede confirmação.
    confirmModal('Mover '+ids.length+' recibo(s)?', 'Isso move '+ids.length+' recibo(s) selecionado(s) pra encomenda "'+destino+'".', async ()=>{
      try{
        await api.moverParaEncomenda(ids, destino);
        historico.forEach(h=>{ if(ids.includes(h.id)) h.encomenda = destino; });
        renderHistorico();
        showToast(ids.length+' recibo(s) movido(s) pra "'+destino+'".');
      }catch(e){
        renderHistorico();
        el.insertAdjacentHTML('afterbegin', '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>');
      }
    });
  });
  $('#btn-limpar-historico').addEventListener('click', ()=>{
    confirmModal('Limpar todo o histórico?', 'Isso apaga todos os '+historico.length+' recibos salvos. Essa ação não pode ser desfeita.', async ()=>{
      try{
        await api.limparHistorico();
        historico = [];
        renderHistorico();
      }catch(e){
        el.innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>' + el.innerHTML;
      }
    });
  });

  // Event listeners das diárias
  $$('.btn-add-diaria', el).forEach(btn=>{
    btn.addEventListener('click', ()=>abrirAdicionarDiaria(btn.dataset.encomenda));
  });
  $$('.diaria-item', el).forEach(item=>{
    item.addEventListener('click', ()=>{
      const id = parseInt(item.dataset.diarioId);
      const d = diarias.find(x=>x.id===id);
      if(d) abrirEditarDiaria(d);
    });
  });
}

// ---------- imprimir selecionados ----------
function imprimirSelecionados(idsRecibos){
  // Filtra apenas os recibos selecionados
  const recibosParaImprimir = historico.filter(h => idsRecibos.includes(h.id));

  if(!recibosParaImprimir.length) return;

  // Cria um elemento para impressão (SEM display:none, vamos usar class ao invés)
  const printDiv = document.createElement('div');
  printDiv.className = 'print-area-hidden';
  printDiv.id = 'print-area-' + Date.now();

  // Cria o HTML para impressão com melhor formatação
  let html = '<style>' +
    '@media print { ' +
    'body { background: white; margin: 0; padding: 0; } ' +
    '.app, .header, .tabs, #panel-calc, #panel-produtos { display: none !important; } ' +
    '.print-area-hidden { display: block !important; margin: 0; padding: 0; } ' +
    '.print-header { page-break-after: avoid; } ' +
    '.print-recibo { page-break-inside: avoid; margin-bottom: 20pt; } ' +
    '} ' +
    '</style>';

  html += '<div style="font-family: \'IBM Plex Sans\', sans-serif; padding: 20px; color: #2B2823;">';
  html += '<div class="print-header" style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2B2823; padding-bottom: 15px;">';
  html += '<h1 style="font-family: \'Zilla Slab\', serif; margin: 0 0 10px 0; font-size: 26px;">🧾 Recibos de Produção</h1>';
  html += '<h2 style="font-family: \'Zilla Slab\', serif; margin: 0 0 8px 0; font-size: 18px; font-weight: 500; color: #6B6355;">J J Marmorite</h2>';
  html += '<p style="margin: 8px 0 0; font-size: 13px; color: #6B6355; font-weight: 500;">';
  html += recibosParaImprimir.length + ' recibo' + (recibosParaImprimir.length !== 1 ? 's' : '') + ' selecionado' + (recibosParaImprimir.length !== 1 ? 's' : '');
  html += '</p></div>';

  // Renderiza cada recibo
  recibosParaImprimir.forEach((calc, idx) => {
    html += '<div class="print-recibo" style="background: #FBF9F4; border: 1px solid #CDC5B2; border-radius: 4px; margin: 0 0 25px 0; padding: 0;">';

    // Cabeçalho do recibo
    html += '<div style="padding: 14px 18px 8px; background: white; border-bottom: 1px solid #E1DBCB;">';
    html += '<div style="font-family: \'Zilla Slab\', serif; font-weight: 600; font-size: 15px; margin: 0 0 4px 0; color: #2B2823;">';
    html += 'Recibo #' + (idx + 1) + (calc.nota ? ' — ' + escapeHtml(calc.nota) : '');
    html += '</div>';
    html += '<div style="font-size: 12px; color: #6B6355; margin: 0;">';
    html += fmtDateShort(calc.data);
    if(calc.encomenda) html += ' | Encomenda: ' + escapeHtml(calc.encomenda);
    html += '</div></div>';

    // Itens
    html += '<div style="padding: 10px 18px;">';
    calc.itens.forEach(it => {
      if (it.ok) {
        html += '<div style="display: grid; grid-template-columns: 50px 1fr 70px 90px; gap: 10px; padding: 7px 0; border-bottom: 1px solid #E1DBCB; align-items: center; font-size: 12px;">'
          + '<span style="font-family: \'IBM Plex Mono\', monospace; font-weight: 500; color: #8F4223;">' + it.codigo + '</span>'
          + '<span style="color: #2B2823;">' + escapeHtml(it.nome) + '</span>'
          + '<span style="text-align: right; color: #6B6355;">' + it.quantidade.toFixed(0) + '× ' + it.preco.toFixed(2) + '</span>'
          + '<span style="text-align: right; font-weight: 600; color: #B23B32;">' + fmtMoney(it.subtotal) + '</span>'
          + '</div>';
      } else {
        html += '<div style="display: grid; grid-template-columns: 50px 1fr 70px 90px; gap: 10px; padding: 7px 0; border-bottom: 1px solid #E1DBCB; align-items: center; font-size: 12px; opacity: 0.6; color: #6B6355;">'
          + '<span style="font-family: \'IBM Plex Mono\', monospace; font-weight: 500;">' + it.codigo + '</span>'
          + '<span>✗ não encontrado</span>'
          + '<span style="text-align: right;">' + it.quantidade.toFixed(0) + '×</span>'
          + '<span style="text-align: right;">—</span>'
          + '</div>';
      }
    });
    html += '</div>';

    // Rodapé com totais
    html += '<div style="padding: 12px 18px; background: white; border-top: 2px solid #2B2823;">';
    html += '<div style="display: grid; grid-template-columns: 1fr auto; gap: 15px; align-items: center; margin-bottom: 8px;">';
    html += '<span style="font-family: \'Zilla Slab\', serif; font-weight: 600; font-size: 14px; color: #2B2823;">Total a receber</span>';
    html += '<span style="font-weight: 700; font-size: 18px; color: #B23B32;">' + fmtMoney(calc.total) + '</span>';
    html += '</div>';
    html += '<div style="text-align: right; font-size: 11px; color: #6B6355; padding-top: 6px; border-top: 1px solid #E1DBCB;">';
    html += '<strong>' + calc.qtdTotal + ' peça' + (calc.qtdTotal !== 1 ? 's' : '') + '</strong>';
    html += '</div></div></div>';
  });

  html += '</div>';
  printDiv.innerHTML = html;

  // Adiciona o elemento ao DOM (visível pra impressão)
  document.body.appendChild(printDiv);

  // Abre a impressão
  setTimeout(() => {
    window.print();
  }, 300);
}

// ---------- alterar (renomear) uma encomenda inteira ----------
function abrirRenomearEncomenda(nomeAtual){
  const html = '<div class="modal-back" id="ren-back"><div class="modal">'
    + '<h3>Alterar encomenda</h3>'
    + '<p>Renomeia essa encomenda em todos os recibos que pertencem a ela.</p>'
    + '<div class="field"><label class="field-label">Nome da encomenda</label><input type="text" id="ren-novo" value="'+escapeAttr(nomeAtual)+'"></div>'
    + '<div id="ren-alert"></div>'
    + '<div class="row-actions"><button class="btn btn-ghost" id="ren-cancelar">Cancelar</button><button class="btn btn-primary" id="ren-salvar" style="margin-left:auto;">Salvar</button></div>'
    + '</div></div>';
  $('#modal-root').innerHTML = html;
  $('#ren-back').addEventListener('click', (e)=>{ if(e.target.id==='ren-back') $('#modal-root').innerHTML=''; });
  $('#ren-cancelar').addEventListener('click', ()=>{ $('#modal-root').innerHTML=''; });
  $('#ren-salvar').addEventListener('click', ()=>{
    const novoNome = $('#ren-novo').value.trim();
    const alertEl = $('#ren-alert');
    if(!novoNome){ alertEl.innerHTML = '<div class="alert alert-warn">Informe um nome.</div>'; return; }
    if(novoNome === nomeAtual){ $('#modal-root').innerHTML=''; return; }
    // Sistema de segurança: renomear também passa por confirmação — afeta vários recibos de uma vez.
    confirmModal('Confirmar alteração?', 'Isso muda "'+nomeAtual+'" para "'+novoNome+'" em todos os recibos dessa encomenda.', async ()=>{
      try{
        await api.renomearEncomenda(nomeAtual, novoNome);
        historico.forEach(h=>{ if(h.encomenda===nomeAtual) h.encomenda = novoNome; });
        renderHistorico();
        showToast('Encomenda alterada.');
      }catch(e){
        abrirRenomearEncomenda(nomeAtual);
        $('#ren-alert').innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>';
      }
    });
  });
}

// ---------- adicionar diária ----------
function abrirAdicionarDiaria(encomenda){
  const dataHoje = new Date().toISOString().split('T')[0];
  const html = '<div class="modal-back" id="add-diaria-back"><div class="modal">'
    + '<h3>Adicionar diária — '+escapeHtml(encomenda)+'</h3>'
    + '<div class="field"><label class="field-label">Data (opcional)</label><input type="date" id="add-diaria-data" value="'+dataHoje+'"></div>'
    + '<div class="field"><label class="field-label">Valor (R$)</label><input type="number" id="add-diaria-valor" value="120" step="0.01" min="0"></div>'
    + '<div class="field"><label class="field-label">Comentário (opcional)</label><input type="text" id="add-diaria-comentario" placeholder="ex: Montagem"></div>'
    + '<div id="add-diaria-alert"></div>'
    + '<div class="row-actions"><button class="btn btn-ghost" id="add-diaria-cancelar">Cancelar</button><button class="btn btn-primary" id="add-diaria-salvar" style="margin-left:auto;">Adicionar</button></div>'
    + '</div></div>';
  $('#modal-root').innerHTML = html;
  $('#add-diaria-back').addEventListener('click', (e)=>{ if(e.target.id==='add-diaria-back') $('#modal-root').innerHTML=''; });
  $('#add-diaria-cancelar').addEventListener('click', ()=>{ $('#modal-root').innerHTML=''; });
  $('#add-diaria-salvar').addEventListener('click', async ()=>{
    const data = $('#add-diaria-data').value.trim();
    const valor = parseFloat($('#add-diaria-valor').value);
    const comentario = $('#add-diaria-comentario').value.trim();
    const alertEl = $('#add-diaria-alert');

    if(isNaN(valor) || valor < 0){
      alertEl.innerHTML = '<div class="alert alert-warn">Informe um valor válido.</div>';
      return;
    }

    confirmModal('Confirmar adição?', 'Adiciona R$ '+valor.toFixed(2)+' de diária a "'+encomenda+'".', async ()=>{
      try{
        const nova = await api.criarDiaria({encomenda, data: data||null, valor, comentario: comentario||null});
        renderHistorico();
        showToast('Diária adicionada.');
      }catch(e){
        abrirAdicionarDiaria(encomenda);
        $('#add-diaria-alert').innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>';
      }
    });
  });
}

// ---------- editar diária ----------
function abrirEditarDiaria(diaria){
  const html = '<div class="modal-back" id="edit-diaria-back"><div class="modal">'
    + '<h3>Editar diária</h3>'
    + '<div class="field"><label class="field-label">Data (opcional)</label><input type="date" id="edit-diaria-data" value="'+(diaria.data?diaria.data.split('T')[0]:'')+'"></div>'
    + '<div class="field"><label class="field-label">Valor (R$)</label><input type="number" id="edit-diaria-valor" value="'+diaria.valor+'" step="0.01" min="0"></div>'
    + '<div class="field"><label class="field-label">Comentário (opcional)</label><input type="text" id="edit-diaria-comentario" value="'+(diaria.comentario?escapeAttr(diaria.comentario):'')+'"></div>'
    + '<div id="edit-diaria-alert"></div>'
    + '<div class="row-actions"><button class="btn btn-danger" id="edit-diaria-excluir">Excluir</button><button class="btn btn-ghost" id="edit-diaria-cancelar" style="margin-left:auto;">Cancelar</button><button class="btn btn-primary" id="edit-diaria-salvar">Salvar</button></div>'
    + '</div></div>';
  $('#modal-root').innerHTML = html;

  $('#edit-diaria-back').addEventListener('click', (e)=>{ if(e.target.id==='edit-diaria-back') $('#modal-root').innerHTML=''; });
  $('#edit-diaria-cancelar').addEventListener('click', ()=>{ $('#modal-root').innerHTML=''; });

  $('#edit-diaria-excluir').addEventListener('click', ()=>{
    confirmModal('Excluir diária?', 'Isso apaga a diária de R$ '+diaria.valor.toFixed(2)+'.', async ()=>{
      try{
        await api.excluirDiaria(diaria.id);
        renderHistorico();
        showToast('Diária excluída.');
      }catch(e){
        abrirEditarDiaria(diaria);
        $('#edit-diaria-alert').innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>';
      }
    });
  });

  $('#edit-diaria-salvar').addEventListener('click', async ()=>{
    const data = $('#edit-diaria-data').value.trim();
    const valor = parseFloat($('#edit-diaria-valor').value);
    const comentario = $('#edit-diaria-comentario').value.trim();
    const alertEl = $('#edit-diaria-alert');

    if(isNaN(valor) || valor < 0){
      alertEl.innerHTML = '<div class="alert alert-warn">Informe um valor válido.</div>';
      return;
    }

    confirmModal('Confirmar alteração?', 'Atualiza a diária pra R$ '+valor.toFixed(2)+'.', async ()=>{
      try{
        await api.editarDiaria(diaria.id, {data: data||null, valor, comentario: comentario||null});
        renderHistorico();
        showToast('Diária atualizada.');
      }catch(e){
        abrirEditarDiaria(diaria);
        $('#edit-diaria-alert').innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>';
      }
    });
  });
}

function abrirDetalheHistorico(calc, idx){
  let html = '<div class="modal-back" id="detail-back"><div class="modal" style="max-width:440px; max-height:82vh; overflow-y:auto;">';
  html += '<h3>'+(calc.nota?escapeHtml(calc.nota):'Recibo')+'</h3>';
  html += '<p style="margin-top:-6px;">'+fmtDateShort(calc.data)+' · '+calc.qtdTotal+' peças</p>';
  html += '<div class="receipt-list" style="padding:0;">';
  calc.itens.forEach(it=>{
    html += '<div class="ritem">'
      + '<span class="icode">'+it.codigo+'</span>'
      + '<span class="iname">'+(it.ok?escapeHtml(it.nome):'código não encontrado')+'</span>'
      + '<span class="ileader"></span>'
      + '<span class="iqty">'+it.quantidade+'×</span>'
      + '<span class="ival">'+(it.ok?fmtMoney(it.subtotal):'—')+'</span>'
      + '</div>';
  });
  html += '</div>';
  html += '<div class="receipt-total" style="padding-left:0; padding-right:0;"><span class="tlabel">Total</span><span class="tvalue">'+fmtMoney(calc.total)+'</span></div>';
  html += '<div id="detalhe-alert"></div>';
  html += '<div class="row-actions">'
    + '<button class="btn btn-ghost" id="btn-compartilhar-detalhe">Compartilhar</button>'
    + '<button class="btn btn-ghost" id="btn-editar-detalhe">Editar</button>'
    + '<button class="btn btn-danger" id="btn-excluir-detalhe">Excluir</button>'
    + '<button class="btn btn-ghost" id="btn-fechar-detalhe" style="margin-left:auto;">Fechar</button>'
    + '</div>';
  html += '</div></div>';
  $('#modal-root').innerHTML = html;
  $('#detail-back').addEventListener('click', (e)=>{ if(e.target.id==='detail-back') $('#modal-root').innerHTML=''; });
  $('#btn-fechar-detalhe').addEventListener('click', ()=>{ $('#modal-root').innerHTML=''; });
  $('#btn-compartilhar-detalhe').addEventListener('click', ()=>shareRecibo(calc));
  $('#btn-editar-detalhe').addEventListener('click', ()=>abrirEdicaoRecibo(calc, idx));
  $('#btn-excluir-detalhe').addEventListener('click', ()=>{
    confirmModal('Excluir este recibo?', 'Isso apaga o recibo'+(calc.nota?' "'+calc.nota+'"':'')+' ('+fmtMoney(calc.total)+', '+calc.qtdTotal+' peças) do histórico. Essa ação não pode ser desfeita.', async ()=>{
      try{
        await api.excluirRecibo(calc.id);
        historico.splice(idx, 1);
        $('#modal-root').innerHTML = '';
        renderHistorico();
        showToast('Recibo excluído.');
      }catch(e){
        abrirDetalheHistorico(calc, idx);
        $('#detalhe-alert').innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>';
      }
    });
  });
}

// ---------- edição de recibo salvo ----------
function abrirEdicaoRecibo(calc, idx){
  const dataInputVal = (calc.data || '').slice(0, 10); // ISO -> AAAA-MM-DD
  let html = '<div class="modal-back" id="edit-back"><div class="modal" style="max-width:480px; max-height:86vh; overflow-y:auto;">';
  html += '<h3>Editar recibo</h3>';
  html += '<div class="field"><label class="field-label">Encomenda</label><input type="text" id="ed-encomenda" value="'+escapeAttr(calc.encomenda||'')+'"></div>';
  html += '<div class="field"><label class="field-label">Nota</label><input type="text" id="ed-nota" value="'+escapeAttr(calc.nota||'')+'"></div>';
  html += '<div class="field"><label class="field-label">Data</label><input type="date" id="ed-data" value="'+dataInputVal+'"></div>';
  html += '<div class="table-scroll" style="max-height:280px;"><table><thead><tr>'
    + '<th style="width:60px;">Código</th><th>Produto</th><th style="width:70px;">Qtd</th><th style="width:80px;">Preço</th><th style="width:28px;"></th>'
    + '</tr></thead><tbody id="ed-itens-tbody">';
  calc.itens.forEach((it, i)=>{
    html += '<tr data-i="'+i+'">'
      + '<td class="tcode">'+escapeHtml(it.codigo)+'</td>'
      + '<td><input type="text" data-field="nome" value="'+escapeAttr(it.nome||'')+'"></td>'
      + '<td><input type="text" data-field="quantidade" value="'+it.quantidade+'"></td>'
      + '<td class="tprice"><input type="text" data-field="preco" value="'+it.preco.toFixed(2)+'"></td>'
      + '<td><button class="del-btn" title="Remover linha">✕</button></td>'
      + '</tr>';
  });
  html += '</tbody></table></div>';
  html += '<div class="receipt-total" style="padding-left:0; padding-right:0;"><span class="tlabel">Novo total</span><span class="tvalue" id="ed-total-preview">'+fmtMoney(calc.total)+'</span></div>';
  html += '<div id="ed-alert"></div>';
  html += '<div class="row-actions"><button class="btn btn-ghost" id="ed-cancelar">Cancelar</button><button class="btn btn-primary" id="ed-salvar" style="margin-left:auto;">Salvar alterações</button></div>';
  html += '</div></div>';
  $('#modal-root').innerHTML = html;

  const tbody = $('#ed-itens-tbody');

  function recalcularPreview(){
    let total = 0;
    $$('tr', tbody).forEach(tr=>{
      const qtd = parseFloat($('input[data-field=quantidade]', tr).value.replace(',','.')) || 0;
      const preco = parseFloat($('input[data-field=preco]', tr).value.replace(',','.')) || 0;
      total += qtd * preco;
    });
    $('#ed-total-preview').textContent = fmtMoney(total);
  }
  $$('input', tbody).forEach(inp=>inp.addEventListener('input', recalcularPreview));
  $$('.del-btn', tbody).forEach(btn=>{
    btn.addEventListener('click', ()=>{ btn.closest('tr').remove(); recalcularPreview(); });
  });

  $('#edit-back').addEventListener('click', (e)=>{ if(e.target.id==='edit-back') $('#modal-root').innerHTML=''; });
  $('#ed-cancelar').addEventListener('click', ()=>abrirDetalheHistorico(calc, idx));

  $('#ed-salvar').addEventListener('click', async ()=>{
    const alertEl = $('#ed-alert');
    const data = $('#ed-data').value;
    if(!data){ alertEl.innerHTML = '<div class="alert alert-warn">Informe a data.</div>'; return; }
    const itens = [];
    for(const tr of $$('tr', tbody)){
      const codigo = tr.querySelector('.tcode').textContent.trim();
      const nome = $('input[data-field=nome]', tr).value.trim();
      const quantidade = parseFloat($('input[data-field=quantidade]', tr).value.replace(',','.'));
      const preco = parseFloat($('input[data-field=preco]', tr).value.replace(',','.'));
      if(isNaN(quantidade) || isNaN(preco)){
        alertEl.innerHTML = '<div class="alert alert-warn">Tem quantidade ou preço inválido em alguma linha.</div>';
        return;
      }
      itens.push({codigo, nome, quantidade, preco});
    }
    if(!itens.length){
      alertEl.innerHTML = '<div class="alert alert-warn">O recibo precisa ter pelo menos um item — ou exclua o recibo inteiro.</div>';
      return;
    }
    const encomenda = $('#ed-encomenda').value.trim();
    const nota = $('#ed-nota').value.trim();

    // Sistema de segurança: nenhuma alteração é salva sem confirmação explícita.
    confirmModal('Confirmar alteração deste recibo?', 'Isso substitui os dados salvos deste recibo. Confere antes de confirmar — essa ação não tem desfazer.', async ()=>{
      try{
        const salvo = await api.editarRecibo(calc.id, {nota, encomenda, data, itens});
        const atualizado = {
          id: salvo.id, data: salvo.data, nota: salvo.nota, encomenda: salvo.encomenda,
          itens: salvo.itens, total: salvo.total, qtdTotal: salvo.qtd_total,
        };
        historico[idx] = atualizado;
        renderHistorico();
        showToast('Recibo atualizado.');
      }catch(e){
        abrirEdicaoRecibo(calc, idx);
        $('#ed-alert').innerHTML = '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>';
      }
    });
  });
}

// ---------- confirm modal ----------
function confirmModal(title, msg, onConfirm){
  const html = '<div class="modal-back" id="confirm-back"><div class="modal">'
    + '<h3>'+escapeHtml(title)+'</h3><p>'+escapeHtml(msg)+'</p>'
    + '<div class="row-actions"><button class="btn btn-ghost" id="cf-cancel">Cancelar</button><button class="btn btn-danger" id="cf-ok">Confirmar</button></div>'
    + '</div></div>';
  $('#modal-root').innerHTML = html;
  $('#confirm-back').addEventListener('click', (e)=>{ if(e.target.id==='confirm-back') $('#modal-root').innerHTML=''; });
  $('#cf-cancel').addEventListener('click', ()=>{ $('#modal-root').innerHTML=''; });
  $('#cf-ok').addEventListener('click', async ()=>{
    $('#modal-root').innerHTML='';
    await onConfirm();
  });
}

// ---------- init ----------
async function init(){
  $('#today-stamp').textContent = new Date().toLocaleDateString('pt-BR', {day:'2-digit', month:'short', year:'numeric'}).replace('.','');
  try{
    const [p, h] = await Promise.all([api.getProdutos(), api.getRecibos()]);
    produtos = p;
    historico = h.map(r=>({id:r.id, data:r.data, nota:r.nota, encomenda:r.encomenda, itens:r.itens, total:r.total, qtdTotal:r.qtd_total}));
  }catch(e){
    $('#panel-calc').insertAdjacentHTML('afterbegin', '<div class="alert alert-error">⚠ '+escapeHtml(e.message)+'</div>');
  }
  renderProdutosTable();
}
init();
