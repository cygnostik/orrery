import {test,expect} from '@playwright/test';

for(const width of [1440,700,390])test(`footer credits are left-aligned, linked and bounded at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.goto('/');
 const footer=page.locator('.footer'),credits=page.locator('.footer-credits');
 await footer.scrollIntoViewIfNeeded();
 await expect(footer).not.toContainText(/design preview/i);
 await expect(credits.locator(':scope > span')).toHaveText([
  'Orrery v0.5 Beta | MIT License',
  'Made by Promethean Dynamic Nerdiness',
  'Powered by TrustEdge.gt Engineered Infrastructure',
 ]);
 const link=credits.getByRole('link',{name:'TrustEdge.gt',exact:true});
 await expect(link).toHaveAttribute('href','https://TrustEdge.gt/');
 await expect(link).toHaveAttribute('target','_blank');
 await expect(link).toHaveAttribute('rel','noopener noreferrer');
 await expect(footer).toContainText('Not everything needs to happen at human speed.');
 await expect(page.locator('#fullscreen')).toBeVisible();
 const geometry=await credits.evaluate(el=>{
  const r=el.getBoundingClientRect(),f=el.closest('footer'),fr=f.getBoundingClientRect();
  return {left:r.left,right:r.right,footerLeft:fr.left,padding:parseFloat(getComputedStyle(f).paddingLeft),textAlign:getComputedStyle(el).textAlign,overflow:document.documentElement.scrollWidth>innerWidth};
 });
 expect(geometry.left).toBeCloseTo(geometry.footerLeft+geometry.padding,1);
 expect(['left','start']).toContain(geometry.textAlign);
 expect(geometry.right).toBeLessThanOrEqual(width);expect(geometry.overflow).toBe(false);
});
