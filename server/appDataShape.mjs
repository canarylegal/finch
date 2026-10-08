export function emptyCompany() {
  return {
    name: '',
    logoUrl: null,
    leaveYearStart: 'January',
    leaveYearEnd: 'December',
    leaveYearConfigured: false,
    leaveYearConfiguredAt: null,
    mandatoryLeaveConfirmations: [],
    defaultRollOver: false,
    defaultEntitlement: 25,
    defaultEntitlementUnit: 'days',
    defaultWorkingDays: [1, 2, 3, 4, 5],
    entitlementIncludesBankHolidays: false,
    emailNotifications: true,
    notificationEvents: {
      leaveRequestSubmitted: true,
      leaveRequestReviewed: true,
      expenseClaimSubmitted: true,
      expenseClaimReviewed: true,
      probationEnding: true,
      documentUpdated: true,
    },
    twoFactorRequired: 'admins',
    payrollEmail: '',
    autoSendPayrollReport: false,
    autoSendDayOfMonth: 3,
    lastAutoPayrollSentPeriodEnd: null,
    payPeriodStartDay: 10,
    bankHolidayRegion: 'england-wales',
    adminsCanApproveOwnRequests: false,
  }
}

export function emptyAppData() {
  return {
    revision: 1,
    employees: [],
    absences: [],
    company: emptyCompany(),
    bankHolidays: [],
    requests: [],
    portalMessages: [],
    documentFolders: [],
    employeeDocuments: [],
    expenseClaims: [],
    vatReceipts: [],
    taskDismissals: [],
    policies: [],
    leaveAdjustments: [],
    leaveYearClosures: [],
    auditEvents: [],
  }
}
