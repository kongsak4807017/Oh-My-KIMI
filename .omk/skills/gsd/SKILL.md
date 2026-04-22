# GSD - Get Shit Done

> **Spec-Driven Development System** - ระบบจัดการโปรเจคแบบมืออาชีพสำหรับการพัฒนาซอฟต์แวร์ด้วย AI

GSD (Get Shit Done) เป็นโครงสร้างการจัดการโปรเจคที่ช่วยให้ AI สร้างซอฟต์แวร์ได้อย่างเป็นระบบ มีการวางแผน ตรวจสอบคุณภาพ และติดตามความคืบหน้า แก้ปัญหา "context rot" - คุณภาพที่ตกเมื่อ context เต็ม

---

## 🎯 หลักการสำคัญ

1. **Context Engineering** - จัดการ context ให้อยู่ในขนาดที่ AI จัดการได้
2. **Spec-Driven** - วางแผนก่อนลงมือทำ ไม่ใช่เขียนโค้ดมั่วๆ
3. **Atomic Commits** - แต่ละ task มี commit ของตัวเอง
4. **Quality Gates** - ตรวจสอบคุณภาพทุกขั้นตอน
5. **Fresh Context** - ทำงานใน context ใหม่ ไม่สะสมขยะ

---

## 📋 ไฟล์สำคัญใน GSD

```
.planning/
├── PROJECT.md          # วิสัยทัศน์โปรเจค
├── REQUIREMENTS.md     # ความต้องการ v1/v2
├── ROADMAP.md          # แผนการพัฒนา
├── STATE.md            # สถานะปัจจุบัน การตัดสินใจ
├── 01-CONTEXT.md       # Context ของ phase 1
├── 01-RESEARCH.md      # ผลการ research phase 1
├── 01-01-PLAN.md       # แผนการทำงาน phase 1 plan 1
├── 01-01-SUMMARY.md    # สรุปผล phase 1 plan 1
├── 01-VERIFICATION.md  # ผลการตรวจสอบ
└── todos/              # รายการงานที่ต้องทำ
```

---

## 🚀 คำสั่งหลัก (GSD Commands)

### เริ่มต้นโปรเจค

```bash
# สร้างโปรเจคใหม่ - ถามจนกว่าจะเข้าใจ แล้วสร้าง roadmap
$gsd-new-project

# วิเคราะห์ codebase ที่มีอยู่ก่อน (สำหรับโปรเจคที่เริ่มไปแล้ว)
$gsd-map-codebase
```

**สิ่งที่ได้:**
- `PROJECT.md` - อธิบายโปรเจค
- `REQUIREMENTS.md` - ความต้องการแยก v1/v2/out-of-scope
- `ROADMAP.md` - แผนการพัฒนาเป็น phase
- `.planning/research/` - ผลการ research

### ทำงานเป็น Phase

แต่ละ phase มี 5 ขั้นตอน: **Discuss → Plan → Execute → Verify → Ship**

```bash
# 1. อภิปราย phase - เก็บความต้องการเฉพาะของ phase นี้
$gsd-discuss-phase 1

# 2. วางแผน phase - research + สร้างแผน + ตรวจสอบแผน
$gsd-plan-phase 1

# 3.  execute - ทำงานตามแผน (parallel waves)
$gsd-execute-phase 1

# 4. ตรวจสอบงาน - UAT + สร้าง fix plan ถ้ามีปัญหา
$gsd-verify-work 1

# 5. สร้าง PR
$gsd-ship 1
```

**ทำขั้นตอนถัดไปอัตโนมัติ:**
```bash
$gsd-next    # AI จะตรวจสอบสถานะและทำขั้นตอนถัดไปให้
```

### จัดการ Milestone

```bash
# จบ milestone ปัจจุบัน
$gsd-complete-milestone

# เริ่ม milestone ใหม่
$gsd-new-milestone "v2.0 Features"

# ตรวจสอบ milestone
$gsd-audit-milestone
```

### งานด่วน (Quick Mode)

สำหรับงานเล็กๆ ที่ไม่ต้องการ planning ยาว:

```bash
# ทำงานเล็กๆ แบบเร็ว (ไม่มี research, plan-checker)
$gsd-quick "Add dark mode toggle"

# แบบเต็มรูปแบบสำหรับงานเล็ก
$gsd-quick --full "Refactor auth module"

# แบบมี discussion ก่อน
$gsd-quick --discuss --research "Implement caching"
```

### ตรวจสอบและปรับปรุง

```bash
# ดูสถานะปัจจุบัน
$gsd-progress

# Code review
$gsd-review

# ตรวจสอบความปลอดภัย
$gsd-secure-phase 1

# Debug ปัญหา
$gsd-debug "Error in login flow"

# สร้างเอกสาร
$gsd-docs-update
```

### จัดการ Backlog

```bash
# เพิ่มไอเดียสำหรับ milestone ถัดไป
$gsd-plant-seed "Add AI-powered search"

# เพิ่มงานใน backlog
$gsd-add-backlog "Fix responsive layout"

# ดู backlog
$gsd-review-backlog

# สร้าง thread สำหรับงานยาวๆ
$gsd-thread "auth-refactor"
```

---

## 🔄 Workflow แบบสมบูรณ์

### สร้างโปรเจคใหม่ตั้งแต่เริ่ม

```bash
# 1. เริ่มโปรเจค
$gsd-new-project
# ตอบคำถาม: โปรเจคคืออะไร? ใครใช้? tech stack? constraints?
# ได้: PROJECT.md, REQUIREMENTS.md, ROADMAP.md

# 2. ทำ Phase 1
$gsd-discuss-phase 1    # เก็บ requirements เฉพาะ phase
$gsd-plan-phase 1        # Research + สร้างแผน
$gsd-execute-phase 1     # ทำงาน (parallel execution)
$gsd-verify-work 1       # ตรวจสอบ
$gsd-ship 1              # สร้าง PR

# 3. ทำ Phase 2
$gsd-discuss-phase 2
$gsd-plan-phase 2
$gsd-execute-phase 2
$gsd-verify-work 2
$gsd-ship 2

# 4. จบ Milestone
$gsd-complete-milestone   # Archive + tag release

# 5. เริ่ม Milestone ใหม่
$gsd-new-milestone "v2.0"
```

### ใช้กับโปรเจคที่มีอยู่ (Brownfield)

```bash
# 1. วิเคราะห์ codebase ที่มี
$gsd-map-codebase
# ได้: ข้อมูล stack, architecture, conventions

# 2. สร้างโครงสร้าง GSD
$gsd-new-project
# ระบบจะใช้ข้อมูลจาก map-codebase แทนการถามซ้ำ

# 3. ทำงานตามปกติ
$gsd-discuss-phase 1
$gsd-plan-phase 1
# ...
```

### ทำงานแบบไหลลื่น (Auto-advance)

```bash
# หลังจาก discuss เสร็จ ให้ auto ไป plan + execute
$gsd-discuss-phase 1 --chain

# หรือใช้ next ให้ AI ตัดสินใจ
$gsd-next    # ตรวจสอบสถานะและทำถัดไป
$gsd-next    # ทำต่อไปเรื่อยๆ
```

---

## 🛠️ การตั้งค่า (Settings)

```bash
# ดู/แก้ไขการตั้งค่า
$gsd-settings
```

### โหมดการทำงาน

| Setting | ค่า | คำอธิบาย |
|---------|-----|----------|
| `mode` | `interactive` / `yolo` | ถามก่อนทำ / ทำเลย |
| `granularity` | `coarse` / `standard` / `fine` | ขนาดของ phase |
| `workflow.research` | `true` / `false` | ทำ research ก่อน plan |
| `workflow.plan_check` | `true` / `false` | ตรวจสอบแผนก่อน execute |
| `workflow.verifier` | `true` / `false` | ตรวจสอบหลัง execute |

### ตัวอย่างการตั้งค่า

```json
{
  "mode": "interactive",
  "granularity": "standard",
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "auto_advance": false
  },
  "parallelization": {
    "enabled": true
  }
}
```

---

## 💡 Best Practices

### 1. ใช้ Skip Permissions

```bash
claude --dangerously-skip-permissions
```
หรือตั้งค่า permissions ให้อนุญาตคำสั่งพื้นฐาน

### 2. Vertical Slices ดีกว่า Horizontal Layers

**ดี (ทำพร้อมกันได้):**
- Plan 1: User feature end-to-end
- Plan 2: Product feature end-to-end

**ไม่ดี (ต้องรอกัน):**
- Plan 1: สร้างทุก Models
- Plan 2: สร้างทุก APIs
- Plan 3: สร้างทุก UIs

### 3. อย่าข้าม Discuss Phase

ยิ่งคุยละเอียดตอน discuss ยิ่งได้ของที่ตรงใจ

### 4. Commit บ่อยๆ

GSD ทำ atomic commit ให้อัตโนมัติทุก task ใช้ `git log` เพื่อติดตาม

### 5. ใช้ --chain เมื่อมั่นใจ

พอรู้ว่า workflow ทำงานดีแล้ว ใช้ `--chain` เพื่อความเร็ว

---

## 📊 ตัวอย่างการใช้งานจริง

### สร้าง Web App ใหม่

```bash
$gsd-new-project
# Describe: "E-commerce platform with product catalog, cart, checkout"
# Tech: Next.js, Prisma, PostgreSQL, Stripe

$gsd-discuss-phase 1 --chain
# Phase 1: User authentication and product catalog

$gsd-verify-work 1
$gsd-ship 1

$gsd-next
```

### Refactor โค้ดเก่า

```bash
$gsd-map-codebase
$gsd-new-project

$gsd-quick --full "Refactor auth module to use JWT"
# หรือแบบ full phase
$gsd-discuss-phase 1
$gsd-plan-phase 1 --reviews
$gsd-execute-phase 1
```

### เพิ่ม Feature

```bash
# ดูก่อนว่าอยู่ phase ไหน
$gsd-progress

# เพิ่ม phase ใหม่ระหว่าง phase 2-3
$gsd-insert-phase 3
$gsd-discuss-phase 3
# ...
```

---

## 🔧 OMK + GSD Integration

OMK มี features พิเศษที่ทำงานร่วมกับ GSD ได้ดี:

1. **Token Optimization** - GSD สร้างไฟล์ planning ขนาดใหญ่ OMK จัดการ context ให้อัตโนมัติ
2. **Session Management** - `/sessions` เก็บ session GSD แยกตามโปรเจค
3. **Codebase Index** - `/index` + `/map` ช่วย GSD วิเคราะห์โปรเจคเร็วขึ้น
4. **Autocomplete** - `@` อ้างอิงไฟล์ใน `.planning/` ได้ทันที

### ติดตั้ง GSD ใน OMK

```bash
# 1. ติดตั้ง GSD CLI
npm install -g get-shit-done-cc

# 2. ติดตั้งใน OMK (ถ้ามี local CLI)
get-shit-done-cc --omk --local

# 3. เริ่มใช้งาน
omk
$gsd-help
```

---

## 📚 อ้างอิง

- [GSD GitHub](https://github.com/gsd-build/get-shit-done)
- [GSD User Guide](https://github.com/gsd-build/get-shit-done/blob/main/docs/USER-GUIDE.md)

---

**Remember: The complexity is in the system, not in your workflow.**
