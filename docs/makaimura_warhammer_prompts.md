# 魔界村 (Ghosts 'n Goblins) × 戰鎚 40K (Warhammer Grimdark) 全物件重構提示詞清單

本文件彙整魔界村關卡中所有需重繪之物件、格式規範、背景去背策略與 Nano Banana 生圖提示詞。風格全面從傳統「街機像素風」升級為遊戲主線統一的 **戰鎚 40K 哥德暗黑風 (Warhammer 40K Grimdark Gothic)**。

---

## 視覺風格統一核心規則 (Design Tokens)

1. **背景規範 (Background)**：
   - 角色、怪物、Boss、裝飾物一律使用 **純黑背景 (`#000000`)** 或 **純白背景 (`#FFFFFF`)**，無地面投影、無底盤、無邊框，方便 `cut_sheet.py` 邊緣 FloodFill 100% 無瑕疵去背。
   - 地面紋理必須為 **90 度正俯視 (Top-Down Bird's-Eye View)**，且具備 **四方連續無縫貼圖 (Seamless Tileable)** 特性。
2. **視角規範 (Perspective)**：
   - 角色、怪物、裝飾：正側視圖 (`side-view orthographic 2D`) 或 3/4 俯側視圖 (`3/4 isometric perspective`)。
3. **戰鎚暗黑美學關鍵字 (Warhammer Grimdark Aesthetic)**：
   - 帝國聖約 (`purity seals with wax stamps and liturgical parchment`)
   - 雙頭鷹飾與頭骨裝飾 (`Imperial Aquila, carved ivory skulls, gothic iron filigree`)
   - 混沌恐虐/納垢腐化元素 (`Khorne brass trim, obsidian spikes, Nurgle necrotic rot sores, glowing warp energy`)
   - 高反差邊緣光 (`crisp rim lighting, hyper-detailed battle-worn textures, grim metallic highlights`)

---

## 一、角色 (Character)

### 1. 亞瑟 (Arthur) → 帝國審判官聖殿騎士 / 星際戰士冠軍
- **檔案路徑**：`assets/makaimura/arthur.png`
- **尺寸規格**：遊戲內基準高度 66px（原始生圖裁切後約 512×512）
- **生圖格式**：1:1 單體 或 2x2 Sheet，純黑背景
- **Nano Banana 提示詞 (Prompt)**：
```text
A full-body 2D video game character sprite of Arthur reimagined as a Warhammer 40,000 Grimdark Imperial Inquisitor Paladin Champion. Clad in heavy polished silver ceramite power armor with ornate gold trim, a master-crafted winged knight crusader helm with a glowing blue visor slit, a golden Imperial Aquila (double-headed eagle) emblem embossed on the chestplate, and a crimson heraldic combat tabard adorned with dangling red wax purity seals and liturgical parchment scrolls. He firmly wields a sanctified power halberd crackling with bright azure plasma energy. Orthographic side-view 2D game sprite, high-contrast rim lighting, battle-worn steel textures, isolated on a pure solid pitch black #000000 background, no ground cast shadow, no circular base, clean isolated cutout.
```

---

## 二、一般敵人 (Enemies / Mobs)

### 2. 殭屍 (Makai Zombie) → 納垢瘟疫行者 / 生化機僕遺骸
- **檔案路徑**：`assets/makaimura/makai_zombie.png`
- **尺寸規格**：遊戲內基準高度 54px
- **Nano Banana 提示詞 (Prompt)**：
```text
A full-body 2D video game mob sprite of a Warhammer 40k Poxwalker plague zombie servitor. Shambling decaying mutant corpse fused with crude rusted cybernetic eye lens, bolted iron cranial skull plates, rotting greenish-grey necrotic flesh covered in weeping pustules and coarse stitches. Wearing torn dark olive drab rags and rusted iron collar chains, dragging a heavy corroded industrial spiked iron exhaust pipe. Menacing hunched shambling posture, orthographic side-view 2D sprite, high detail grimdark aesthetic, isolated on a pure solid pitch black #000000 background, no shadows, no floor plate, clean cutout.
```

### 3. 紅魔鬼 (Red Arremer) → 恐虐血角魔翼石像鬼
- **檔案路徑**：`assets/makaimura/makai_red_arremer.png`
- **尺寸規格**：遊戲內基準高度 58px
- **Nano Banana 提示詞 (Prompt)**：
```text
A full-body 2D video game enemy sprite of the Red Arremer reimagined as a ferocious Warhammer 40k Khorne Chaos Blood Gargoyle Daemon. Muscular crimson-red daemon flesh covered in jagged black chitin plates, large leathery bat-like wings with bone spurs spread ready for flight, sweeping curved obsidian and brass horns, piercing glowing yellow eyes, sharp predatory fangs, and razor-sharp black talons in a low predatory crouching combat stance. 2D side-view orthographic sprite, dynamic fiery rim lighting, stylized grimdark dark fantasy art, isolated on a solid pure pitch black #000000 background, no ground shadows, clean transparent edge cutout.
```

### 4. 腐化魔樹 (Makai Woody) → 混沌腐疫靈樹 / 納垢惡魔枯木
- **檔案路徑**：`assets/makaimura/makai_woody.png`
- **尺寸規格**：遊戲內基準高度 66px
- **Nano Banana 提示詞 (Prompt)**：
```text
A full-body 2D video game enemy sprite of Makai Woody reimagined as a Warhammer 40k Nurgle Chaos Corrupted Warp Treant. A sinister twisted ancient dead tree spirit with blackened gnarled bark, overgrown with glowing toxic lime-green fungal blooms and rotting pustules. In the hollow trunk center is a grotesque glowing one-eyed demonic core surrounded by jagged wood teeth. Has withered thorny claw-like branch hands reaching forward and necrotic roots crawling on the ground. Orthographic 2D sprite, grimdark dark fantasy aesthetic, isolated on a solid pure pitch black #000000 background, no shadows, clean cutout.
```

---

## 三、關卡首領 (Bosses)

### 5. 一角魔將‧獨角巨靈 (Unicorn) → 恐虐重裝獨角鋼鐵巨獸 (Chaos Juggernaut Brute)
- **檔案路徑**：`assets/bosses/boss_unicorn.png`
- **尺寸規格**：遊戲內基準高度 120px（高威壓體積感）
- **Nano Banana 提示詞 (Prompt)**：
```text
A towering 2D game boss sprite of the Makaimura Unicorn boss reimagined as a Warhammer 40k Chaos Juggernaut Behemoth. A colossal hulking demonic warlord clad in brutal spiked brass and rusted iron Chaos Terminator power armor. A single massive obsidian curved demonic horn surges forward from its horned iron skull helm. Glowing crimson furnace vent grills pulse from its chestplate, and it wields a colossal spiked Chaos war mace dripping with burning embers. Heavy intimidating battle pose, 3/4 side orthographic view, grimdark gothic dark fantasy style, isolated on a solid pure pitch black #000000 background, no cast shadow, clean edges for alpha mask cutout.
```

### 6. 猩紅魔王‧阿雷默 (Arremer King) → 猩紅惡魔親王 (Daemon Prince of Khorne)
- **檔案路徑**：`assets/bosses/boss_arremer_king.png`
- **尺寸規格**：遊戲內基準高度 130px
- **Nano Banana 提示詞 (Prompt)**：
```text
A majestic, terrifying 2D game boss sprite of the Makaimura Arremer King reimagined as a Warhammer 40k Greater Daemon Prince of Khorne. An imposing towering crimson demonic lord with four massive spiked bat-dragon wings unfurled, wearing an ornate barbed brass-and-skull crown. Heavy brass daemonic armor with carved screaming skull motifs protects its torso and legs. Its eyes burn with yellow Warp fire, and it holds a colossal jagged daemonic hellblade wreathed in raging red hellfire flames. Regal intimidating villain stance, 2D orthographic perspective, rich grimdark painted details, isolated on a pure solid pitch black #000000 background, no ground shadows, clean cutout.
```

### 7. 雙面魔王‧阿斯塔羅特 (Astaroth) → 雙面混沌大魔神 (Dual-Faced Chaos Greater Daemon)
- **檔案路徑**：`assets/bosses/boss_astaroth.png`
- **尺寸規格**：遊戲內基準高度 145px
- **Nano Banana 提示詞 (Prompt)**：
```text
A colossal 2D final boss sprite of Astaroth reimagined as an epic Warhammer 40k Chaos Greater Daemon Overlord. A gigantic towering dual-faced abomination: on top is a regal yet demonic horned crowned obsidian skull visage with glowing violet warp eyes; across its muscular demonic torso and abdomen is embedded a terrifying second gigantic gaping maw filled with razor sharp fangs and a dripping serpentine tongue. Crowned with spiked iron halos and ancient chaos runes, wreathed in dark violet and crimson warp energy mist. Towering menacing front-facing 2D boss sprite, hyper-detailed grimdark aesthetic, isolated on a pure solid pitch black #000000 background, no cast shadows, clean cutout.
```

---

## 四、場景裝飾物件 (Decorations / Props)

### 8. 帝國骷髏墓碑 (`makai_tombstone`)
- **檔案路徑**：`assets/decor/makai_tombstone.png`
- **Nano Banana 提示詞 (Prompt)**：
```text
A 2D game prop sprite of a Warhammer 40k Imperial Gothic stone tombstone grave marker. Cracked weather-beaten dark granite monument carved with an Imperial Aquila (double-headed eagle) and skull crest, with clusters of partially melted white wax candles with flickering orange flames resting around its base. Weathered moss and battle soot. Isolated on pure solid pitch black #000000 background, 2D isometric view, no ground shadow, clean cutout.
```

### 9. 枯骨詛咒之樹 (`makai_dead_tree`)
- **檔案路徑**：`assets/decor/makai_dead_tree.png`
- **Nano Banana 提示詞 (Prompt)**：
```text
A 2D game prop sprite of a grimdark gothic blackened dead tree. Gnarled twisted leafless branches hung with heavy rusted iron chains, two small bone skull trophies, and a weathered red parchment purity seal ribbon fluttering in the wind. Dark atmospheric fantasy style, isolated on pure solid pitch black #000000 background, 2D side view, no ground shadow, clean cutout.
```

### 10. 哥德滴水獸石像 (`makai_gargoyle`)
- **檔案路徑**：`assets/decor/makai_gargoyle.png`
- **Nano Banana 提示詞 (Prompt)**：
```text
A 2D game prop sprite of a gothic cathedral stone gargoyle statue. A winged horned demonic beast carved from aged cracked grey basalt, perching on a decorative gothic pedestal arch with skull reliefs. Glowing faint red gemstones for eyes. Isolated on pure solid pitch black #000000 background, 2D 3/4 view, no ground shadow, clean cutout.
```

### 11. 顱骨聖火甕 (`makai_skull_urn`)
- **檔案路徑**：`assets/decor/makai_skull_urn.png`
- **Nano Banana 提示詞 (Prompt)**：
```text
A 2D game prop sprite of an Imperial Gothic skull brazier urn. Heavy cast iron cauldron resting on clawed iron feet, heaped with weathered human skulls, burning with intense orange fire and violet embers. Intricate skull engravings on the metal cauldron bowl. Isolated on pure solid pitch black #000000 background, 2D front view, no ground shadow, clean cutout.
```

---

## 五、地圖地面紋理 (Ground Texture)

### 12. 魔界焦土與熔岩裂隙 (`ground_makaimura`)
- **檔案路徑**：`assets/ground/ground_makaimura.png`
- **尺寸規格**：1024×1024 無縫四方連續 (Seamless Tileable)
- **Nano Banana 提示詞 (Prompt)**：
```text
A seamless tileable top-down game ground texture of a Warhammer 40k grimdark gothic battlefield. Dark cracked obsidian basalt flagstones, scorched ash and black earth, intersected by glowing deep crimson and orange magma fissures running through the stone crevices. Tiny bone and skull fragments embedded in the soot. Perfectly seamless repeating pattern on all four edges, 90-degree directly bird's-eye top-down view, 1:1 square ratio, flat 2D surface, no perspective distortion, high resolution dark fantasy texture.
```

---

## 六、合輯批次圖 (Batch Sheet Prompts)

若為了節省 API 額度或確保同畫面風格統一，可採用 Nano Banana 推薦的 **2×2 合輯四宮格**：

### Batch Sheet 1: 角色與小怪 (Arthur + 3 Mobs)
```text
A 2x2 sprite sheet containing 4 distinct isolated 2D game sprites, each in its own quadrant with wide pitch-black spacing, isolated on a pure solid pitch black #000000 background:
Top-Left: Arthur as a Warhammer 40k Inquisitor Paladin in ornate silver ceramite armor, winged helmet, chest Aquila, crimson tabard with purity seals, holding glowing azure power halberd.
Top-Right: Plague Zombie servitor mutant with rusted cybernetic eye lens, rotting necrotic green-grey skin, dragging a heavy spiked pipe.
Bottom-Left: Khorne Crimson Gargoyle daemon with leathery bat wings, brass horns, burning yellow eyes, razor talons in predatory crouch.
Bottom-Right: Nurgle corrupted hollow dead tree treant with glowing green fungal rot pustules and a single demonic cyclops eye core.
Style: High-definition 2D stylized Warhammer Grimdark aesthetic, crisp silhouettes, vibrant highlights, no floor shadows, no text, clean cutout borders.
```

### Batch Sheet 2: 關卡首領 (3 Bosses)
```text
A 2x2 boss sheet containing 3 distinct giant boss sprites on a pure solid pitch black #000000 background:
Top-Left: Chaos Juggernaut Brute (Unicorn) in spiked brass Terminator plate armor, huge obsidian horn, swinging spiked war hammer.
Top-Right: Crimson Daemon Prince (Arremer King) with 4 huge wings, barbed crown, brass armor, wielding blazing hellfire broadsword.
Bottom-Center: Astaroth Greater Daemon Overlord, dual-faced colossus with crowned skull face on head and gigantic fanged demonic maw on abdomen, surrounded by violet warp flames.
Style: Warhammer 40k epic grimdark aesthetic, high contrast painted details, no floor shadows, clean alpha cutout.
```

### Batch Sheet 3: 哥德場景裝飾 (4 Props)
```text
A 2x2 game prop sheet of 4 gothic props isolated on pure solid pitch black #000000 background:
Top-Left: Gothic stone tombstone with Imperial Aquila and melted candle clusters.
Top-Right: Blackened dead tree hung with rusted chains, skull trophies, and purity seals.
Bottom-Left: Perched stone gargoyle statue on carved skull pillar pedestal.
Bottom-Right: Cast iron skull brazier urn filled with skulls and burning violet flames.
Style: Warhammer 40k gothic grimdark aesthetic, clean isolated sprites.
```
