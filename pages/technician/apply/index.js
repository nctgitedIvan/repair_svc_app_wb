import Toast from 'tdesign-miniprogram/toast/index';

const phoneUtil = require('../../../utils/phone.js');

/**
 * 師傅端：入駐申請（骨架）。
 *
 * 只做前端校驗與 Toast；P5 接上 `technician.apply` Use Case 後再送出。
 * 技能標籤目前是靜態清單，正式版由後台分類／技能字典提供。
 */
const SKILLS = ['空調', '水電', '家具', '燈具', '家電清洗'];

Page({
  data: {
    ready: false,
    name: '',
    phone: '',
    skills: SKILLS,
    selectedSkills: [],
    submitting: false,
  },

  onLoad() {
    this.setData({ ready: true });
  },

  onNameChange(e) {
    this.setData({ name: (e.detail && e.detail.value) || '' });
  },

  onPhoneChange(e) {
    this.setData({ phone: (e.detail && e.detail.value) || '' });
  },

  onSkillTap(e) {
    const { skill } = e.currentTarget.dataset;
    if (!skill) return;

    const selected = this.data.selectedSkills.includes(skill)
      ? this.data.selectedSkills.filter((entry) => entry !== skill)
      : [...this.data.selectedSkills, skill];

    this.setData({ selectedSkills: selected });
  },

  onSubmit() {
    const { name, phone, selectedSkills, submitting } = this.data;
    if (submitting) return;

    if (!name.trim()) {
      Toast({ context: this, selector: '#t-toast', message: '請輸入姓名', icon: '' });
      return;
    }
    if (!phoneUtil.isValidPhone(phone)) {
      Toast({ context: this, selector: '#t-toast', message: '請輸入有效的手機號（+853／+86）', icon: '' });
      return;
    }
    if (selectedSkills.length === 0) {
      Toast({ context: this, selector: '#t-toast', message: '請至少選擇一項技能', icon: '' });
      return;
    }

    Toast({ context: this, selector: '#t-toast', message: '入駐申請功能建置中（P5）', icon: '' });
  },
});
