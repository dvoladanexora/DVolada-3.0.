/** Una única regla de acceso para lecturas y mutaciones de restaurante.
 *
 * El token solo identifica al empleado y su restaurante: el rol y plan se
 * consultan a PostgreSQL EN CADA solicitud. Las transacciones de escritura
 * deben usar lock=true después de BEGIN, antes del primer UPDATE.
 *
 * No acepta roles del cliente ni asume que un usuario pertenece al negocio
 * solo por conocer su ID.
 */
import {validRestaurantRole} from './restaurant-permissions.js';

export const MEMBER_SQL=
 'SELECT u.role,r.plan,r.subscription_status FROM restaurant_users u JOIN restaurants r ON r.id=u.restaurant_id WHERE u.restaurant_id=$1 AND u.user_id=$2 AND u.active=TRUE';

export function verifiedRestaurantRole(row){
 if(!row||!validRestaurantRole(row.role)||row.subscription_status!=='active'
  ||!['ONLINE','PLUS'].includes(row.plan))return null;
 return row.role;
}
export async function activeRestaurantRole(db,restaurantId,userId,{lock=false}={}){
 if(!db||typeof db.query!=='function'
  ||typeof restaurantId!=='string'||typeof userId!=='string')
  throw Error('Invalid membership lookup');
 const sql=MEMBER_SQL+(lock?' FOR SHARE OF u,r':'');
 const result=await db.query(sql,[restaurantId,userId]);
 return verifiedRestaurantRole(result?.rows?.[0]);
}
