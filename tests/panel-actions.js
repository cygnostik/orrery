// Explicitly visit moved controls through the public tab UI, then return to
// the information panel so existing subject assertions keep their meaning.
export async function panelAction(page,name,action){
 await page.getByRole('tab',{name,exact:true}).click();
 const result=await action();
 await page.getByRole('tab',{name:'Info',exact:true}).click();
 return result;
}
