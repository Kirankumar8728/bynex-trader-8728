import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import babel from '@babel/core';

async function main() {
  const files = await glob('**/*.{ts,tsx}', { ignore: ['node_modules/**', 'dist/**'] });
  
  for (const file of files) {
    if (file.endsWith('.d.ts')) {
      await fs.unlink(file);
      console.log(`Deleted ${file}`);
      continue;
    }

    const isTSX = file.endsWith('.tsx');
    const newExt = isTSX ? '.jsx' : '.js';
    const newFile = file.slice(0, -path.extname(file).length) + newExt;
    
    console.log(`Processing ${file} -> ${newFile}`);

    try {
      const result = await babel.transformFileAsync(file, {
        presets: [
          ['@babel/preset-typescript', { isTSX, allExtensions: true }]
        ],
        plugins: [
          '@babel/plugin-syntax-jsx'
        ],
        retainLines: true,
        generatorOpts: {
          retainLines: true
        }
      });

      if (result && result.code != null) {
        await fs.writeFile(newFile, result.code);
        await fs.unlink(file);
        console.log(`Converted ${file}`);
      } else {
        console.error(`Failed to convert ${file}`);
      }
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }
}

main().catch(console.error);
