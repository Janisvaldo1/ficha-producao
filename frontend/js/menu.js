// Abre e fecha o menu em tela pequena. Em tela grande o CSS mantém o menu sempre aberto.
(function(){
  const nav = document.querySelector('.sidebar');
  const botao = document.getElementById('menu-toggle');
  if(!nav || !botao) return;

  function definirAberto(aberto){
    nav.classList.toggle('menu-aberto', aberto);
    botao.setAttribute('aria-expanded', String(aberto));
    botao.textContent = aberto ? 'Fechar menu' : 'Menu';
  }

  botao.addEventListener('click', function(){
    definirAberto(!nav.classList.contains('menu-aberto'));
  });
  nav.querySelectorAll('.side-link').forEach(function(link){
    link.addEventListener('click', function(){ definirAberto(false); });
  });
})();
