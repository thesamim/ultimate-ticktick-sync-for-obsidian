import fs from 'fs';
import path from 'path';


const now = new Date()
console.log(now.toString());
fs.copyFile(`E:\\Dev\\testVault\\.obsidian\\plugins\\tickticksync\\data.json', E:\\Dev\\testVault\\.obsidian\\plugins\\tickticksync\\data.json)
