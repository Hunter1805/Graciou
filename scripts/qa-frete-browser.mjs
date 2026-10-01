export default async function run(page) {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('graciou-cart-v1', JSON.stringify([{ productId: 'tee-raizes', nome: 'Camiseta Raízes', tamanho: 'M', cor: 'Verde-musgo', quantidade: 1, precoPix: 9990, precoCartao: 10990, key: 'tee-raizes::M::Verde-musgo' }]));
  });
  await page.reload();
  await page.waitForFunction(() => document.body.textContent.includes('Informe a UF para calcular o frete.'));
  const semUf = await page.textContent('#cart-valor-frete');
  await page.fill('#cart-estado', 'sp');
  await page.waitForTimeout(100);
  const sp = await page.textContent('#cart-valor-frete');
  const totalSp = await page.textContent('#cart-total');
  await page.fill('#cart-estado', 'ba');
  await page.waitForTimeout(100);
  const ba = await page.textContent('#cart-valor-frete');
  return { semUf, sp, totalSp, ba, uf: await page.inputValue('#cart-estado') };
}
