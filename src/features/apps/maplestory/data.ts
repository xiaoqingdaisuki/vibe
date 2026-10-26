/** 冒险岛图鉴：静态数据 */

import { getMonstersWithDrops } from './table-model';
import monsterDatabaseDocument from './data/monsters.json';
import type { MonsterDatabase } from './types';

export const monsterDatabase: MonsterDatabase = monsterDatabaseDocument;

export const monstersWithDrops = getMonstersWithDrops(monsterDatabase.monsters);
