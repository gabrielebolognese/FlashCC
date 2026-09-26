/**
 * The privacy notice, adapted from the FlashFX one as instructed.
 *
 * Three deliberate deviations from "everything else stays the same", each one
 * because leaving it would have made the document false rather than merely
 * differently worded. They are listed in the recap and repeated here:
 *
 * 1. **Stripe became Paddle.** The source named Stripe as the processor of all
 *    payment data. FlashCC takes money through Paddle, who are the merchant of
 *    record. A privacy notice naming the wrong processor is inaccurate on the one
 *    point Paddle's own verification reads it for.
 * 2. **The date.** A notice materially re-issued for a different product cannot
 *    honestly carry the old document's date.
 * 3. **The product name and domain**, which is what was asked for. See `COMPANY`
 *    in `legal.ts` for the two values that want a human's eye.
 *
 * Everything else, including the retention wording, the US state table and the
 * two different contact addresses across the two documents, is as supplied.
 */
import { COMPANY, postalAddress, type LegalDoc } from "./legal.js";

const body = `
${COMPANY.name} ("**we**," "**us**," or "**our**") describes how and why we might
access, collect, store, use, and/or share ("**process**") your personal
information when you use our services ("**Services**"), including when you:

- Visit our website at [https://${COMPANY.site}](https://${COMPANY.site}), or any website of ours that links to this Privacy Notice
- Engage with us in other related ways, including any marketing or events

**Questions or concerns?** Reading this Privacy Notice will help you understand
your privacy rights and choices. We are responsible for making decisions about
how your personal information is processed. If you do not agree with our policies
and practices, please do not use our Services. If you still have any questions or
concerns, please contact us at [${COMPANY.privacyEmail}](mailto:${COMPANY.privacyEmail}).

## {summary} SUMMARY OF KEY POINTS

> This summary provides key points from our Privacy Notice, but you can find out
> more details about any of these topics below.

**What personal information do we process?** When you visit, use, or navigate our
Services, we may process personal information depending on how you interact with
us and the Services, the choices you make, and the products and features you use.

**Do we process any sensitive personal information?** Some of the information may
be considered "special" or "sensitive" in certain jurisdictions, for example your
racial or ethnic origins, sexual orientation, and religious beliefs. We do not
process sensitive personal information.

**Do we collect any information from third parties?** We do not collect any
information from third parties.

**How do we process your information?** We process your information to provide,
improve, and administer our Services, communicate with you, for security and
fraud prevention, and to comply with law. We may also process your information
for other purposes with your consent. We process your information only when we
have a valid legal reason to do so.

**In what situations and with which parties do we share personal information?** We
may share information in specific situations and with specific third parties.

**How do we keep your information safe?** We have adequate organizational and
technical processes and procedures in place to protect your personal information.
However, no electronic transmission over the internet or information storage
technology can be guaranteed to be 100% secure, so we cannot promise or guarantee
that hackers, cybercriminals, or other unauthorized third parties will not be
able to defeat our security and improperly collect, access, steal, or modify your
information.

**What are your rights?** Depending on where you are located geographically, the
applicable privacy law may mean you have certain rights regarding your personal
information.

**How do you exercise your rights?** The easiest way to exercise your rights is by
submitting a [data subject access request](${COMPANY.dsar}), or by contacting us.
We will consider and act upon any request in accordance with applicable data
protection laws.

## {infocollect} 1. WHAT INFORMATION DO WE COLLECT?

### Personal information you disclose to us

> **In Short:** We collect personal information that you provide to us.

We collect personal information that you voluntarily provide to us when you
register on the Services, express an interest in obtaining information about us
or our products and Services, when you participate in activities on the Services,
or otherwise when you contact us.

**Personal Information Provided by You.** The personal information that we collect
depends on the context of your interactions with us and the Services, the choices
you make, and the products and features you use. The personal information we
collect may include the following:

- email addresses
- passwords

**Sensitive Information.** We do not process sensitive information.

**Payment Data.** We may collect data necessary to process your payment if you
choose to make purchases, such as your payment instrument number, and the
security code associated with your payment instrument. All payment data is
handled and stored by Paddle, who are the merchant of record for all purchases.
You may find their privacy notice link(s) here:
[https://www.paddle.com/legal/privacy](https://www.paddle.com/legal/privacy).

**Social Media Login Data.** We may provide you with the option to register with
us using your existing social media account details, like your Facebook, X, or
other social media account. If you choose to register in this way, we will collect
certain profile information about you from the social media provider, as described
in the section called "HOW DO WE HANDLE YOUR SOCIAL LOGINS?" below.

All personal information that you provide to us must be true, complete, and
accurate, and you must notify us of any changes to such personal information.

## {infouse} 2. HOW DO WE PROCESS YOUR INFORMATION?

> **In Short:** We process your information to provide, improve, and administer
> our Services, communicate with you, for security and fraud prevention, and to
> comply with law. We process the personal information for the following purposes
> listed below. We may also process your information for other purposes only with
> your prior explicit consent.

**We process your personal information for a variety of reasons, depending on how
you interact with our Services, including:**

- **To facilitate account creation and authentication and otherwise manage user accounts.** We may process your information so you can create and log in to your account, as well as keep your account in working order.
- **To save or protect an individual's vital interest.** We may process your information when necessary to save or protect an individual's vital interest, such as to prevent harm.

## {legalbases} 3. WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR INFORMATION?

> **In Short:** We only process your personal information when we believe it is
> necessary and we have a valid legal reason (i.e., legal basis) to do so under
> applicable law, like with your consent, to comply with laws, to provide you with
> services to enter into or fulfill our contractual obligations, to protect your
> rights, or to fulfill our legitimate business interests.

**If you are located in the EU or UK, this section applies to you.**

The General Data Protection Regulation (GDPR) and UK GDPR require us to explain
the valid legal bases we rely on in order to process your personal information. As
such, we may rely on the following legal bases to process your personal
information:

- **Consent.** We may process your information if you have given us permission (i.e., consent) to use your personal information for a specific purpose. You can withdraw your consent at any time.
- **Legal Obligations.** We may process your information where we believe it is necessary for compliance with our legal obligations, such as to cooperate with a law enforcement body or regulatory agency, exercise or defend our legal rights, or disclose your information as evidence in litigation in which we are involved.
- **Vital Interests.** We may process your information where we believe it is necessary to protect your vital interests or the vital interests of a third party, such as situations involving potential threats to the safety of any person.

**If you are located in Canada, this section applies to you.**

We may process your information if you have given us specific permission (i.e.,
express consent) to use your personal information for a specific purpose, or in
situations where your permission can be inferred (i.e., implied consent). You can
withdraw your consent at any time.

In some exceptional cases, we may be legally permitted under applicable law to
process your information without your consent, including, for example:

- If collection is clearly in the interests of an individual and consent cannot be obtained in a timely way
- For investigations and fraud detection and prevention
- For business transactions provided certain conditions are met
- If it is contained in a witness statement and the collection is necessary to assess, process, or settle an insurance claim
- For identifying injured, ill, or deceased persons and communicating with next of kin
- If we have reasonable grounds to believe an individual has been, is, or may be victim of financial abuse
- If it is reasonable to expect collection and use with consent would compromise the availability or the accuracy of the information and the collection is reasonable for purposes related to investigating a breach of an agreement or a contravention of the laws of Canada or a province
- If disclosure is required to comply with a subpoena, warrant, court order, or rules of the court relating to the production of records
- If it was produced by an individual in the course of their employment, business, or profession and the collection is consistent with the purposes for which the information was produced
- If the collection is solely for journalistic, artistic, or literary purposes
- If the information is publicly available and is specified by the regulations
- We may disclose de-identified information for approved research or statistics projects, subject to ethics oversight and confidentiality commitments

## {whoshare} 4. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?

> **In Short:** We may share information in specific situations described in this
> section and/or with the following third parties.

We may need to share your personal information in the following situations:

- **Business Transfers.** We may share or transfer your information in connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business to another company.

## {ai} 5. DO WE OFFER ARTIFICIAL INTELLIGENCE-BASED PRODUCTS?

> **In Short:** We offer products, features, or tools powered by artificial
> intelligence, machine learning, or similar technologies.

As part of our Services, we offer products, features, or tools powered by
artificial intelligence, machine learning, or similar technologies (collectively,
"AI Products"). These tools are designed to enhance your experience and provide
you with innovative solutions. The terms in this Privacy Notice govern your use of
the AI Products within our Services.

### Use of AI Technologies

We provide the AI Products through third-party service providers ("AI Service
Providers"), including OpenAI and Anthropic. As outlined in this Privacy Notice,
your input, output, and personal information will be shared with and processed by
these AI Service Providers to enable your use of our AI Products for purposes
outlined in "WHAT LEGAL BASES DO WE RELY ON TO PROCESS YOUR PERSONAL INFORMATION?"
You must not use the AI Products in any way that violates the terms or policies of
any AI Service Provider.

### Our AI Products

Our AI Products are designed for the following functions:

- AI automation

### How We Process Your Data Using AI

All personal information processed using our AI Products is handled in line with
our Privacy Notice and our agreement with third parties. This ensures high
security and safeguards your personal information throughout the process, giving
you peace of mind about your data's safety.

## {sociallogins} 6. HOW DO WE HANDLE YOUR SOCIAL LOGINS?

> **In Short:** If you choose to register or log in to our Services using a social
> media account, we may have access to certain information about you.

Our Services offer you the ability to register and log in using your third-party
social media account details (like your Facebook or X logins). Where you choose to
do this, we will receive certain profile information about you from your social
media provider. The profile information we receive may vary depending on the
social media provider concerned, but will often include your name, email address,
friends list, and profile picture, as well as other information you choose to make
public on such a social media platform.

We will use the information we receive only for the purposes that are described in
this Privacy Notice or that are otherwise made clear to you on the relevant
Services. Please note that we do not control, and are not responsible for, other
uses of your personal information by your third-party social media provider. We
recommend that you review their privacy notice to understand how they collect,
use, and share your personal information, and how you can set your privacy
preferences on their sites and apps.

## {inforetain} 7. HOW LONG DO WE KEEP YOUR INFORMATION?

> **In Short:** We keep your information for as long as necessary to fulfill the
> purposes outlined in this Privacy Notice unless otherwise required by law.

We will only keep your personal information for as long as it is necessary for the
purposes set out in this Privacy Notice, unless a longer retention period is
required or permitted by law (such as tax, accounting, or other legal
requirements). No purpose in this notice will require us keeping your personal
information for longer than the period of time in which users have an account with
us.

When we have no ongoing legitimate business need to process your personal
information, we will either delete or anonymize such information, or, if this is
not possible (for example, because your personal information has been stored in
backup archives), then we will securely store your personal information and
isolate it from any further processing until deletion is possible.

## {infosafe} 8. HOW DO WE KEEP YOUR INFORMATION SAFE?

> **In Short:** We aim to protect your personal information through a system of
> organizational and technical security measures.

We have implemented appropriate and reasonable technical and organizational
security measures designed to protect the security of any personal information we
process. However, despite our safeguards and efforts to secure your information,
no electronic transmission over the Internet or information storage technology can
be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers,
cybercriminals, or other unauthorized third parties will not be able to defeat our
security and improperly collect, access, steal, or modify your information.
Although we will do our best to protect your personal information, transmission of
personal information to and from our Services is at your own risk. You should only
access the Services within a secure environment.

## {privacyrights} 9. WHAT ARE YOUR PRIVACY RIGHTS?

> **In Short:** Depending on your state of residence in the US or in some regions,
> such as the European Economic Area (EEA), United Kingdom (UK), Switzerland, and
> Canada, you have rights that allow you greater access to and control over your
> personal information. You may review, change, or terminate your account at any
> time, depending on your country, province, or state of residence.

In some regions (like the EEA, UK, Switzerland, and Canada), you have certain
rights under applicable data protection laws. These may include the right (i) to
request access and obtain a copy of your personal information, (ii) to request
rectification or erasure; (iii) to restrict the processing of your personal
information; (iv) if applicable, to data portability; and (v) not to be subject to
automated decision-making. If a decision that produces legal or similarly
significant effects is made solely by automated means, we will inform you, explain
the main factors, and offer a simple way to request human review. In certain
circumstances, you may also have the right to object to the processing of your
personal information. You can make such a request by contacting us by using the
contact details provided in the section "HOW CAN YOU CONTACT US ABOUT THIS
NOTICE?" below.

We will consider and act upon any request in accordance with applicable data
protection laws.

If you are located in the UK and are unhappy with how we have handled your
personal information, you can make a complaint directly to us. This is in addition
to the rights you have under the UK General Data Protection Regulation and the
Data Protection Act 2018.

How to contact us:

- **Email:** [${COMPANY.privacyEmail}](mailto:${COMPANY.privacyEmail})
- **Post:** ${postalAddress()}

What happens after you complain:

- We will acknowledge your complaint within 30 days of receiving it.
- We will investigate without unjustifiable or excessive delay.
- We will keep you informed of progress and explain the outcome.

If you are not happy with our final response, you can refer your complaint to the
Information Commissioner's Office, the UK supervisory authority.

- **Website:** [ico.org.uk/make-a-complaint](https://ico.org.uk/make-a-complaint)
- **Helpline:** 0303 123 1113
- **Post:** Information Commissioner's Office, Wycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF

If you are located in the EEA or UK and you believe we are unlawfully processing
your personal information, you also have the right to complain to your
[Member State data protection authority](https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm)
or [UK data protection authority](https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/).

If you are located in Switzerland, you may contact the
[Federal Data Protection and Information Commissioner](https://www.edoeb.admin.ch/edoeb/en/home.html).

**Withdrawing your consent:** If we are relying on your consent to process your
personal information, which may be express and/or implied consent depending on the
applicable law, you have the right to withdraw your consent at any time. You can
withdraw your consent at any time by contacting us by using the contact details
provided in the section "HOW CAN YOU CONTACT US ABOUT THIS NOTICE?" below or
updating your preferences.

However, please note that this will not affect the lawfulness of the processing
before its withdrawal nor, when applicable law allows, will it affect the
processing of your personal information conducted in reliance on lawful processing
grounds other than consent.

### Account Information

If you would at any time like to review or change the information in your account
or terminate your account, you can:

- Log in to your account settings and update your user account.

Upon your request to terminate your account, we will deactivate or delete your
account and information from our active databases. However, we may retain some
information in our files to prevent fraud, troubleshoot problems, assist with any
investigations, enforce our legal terms and/or comply with applicable legal
requirements.

If you have questions or comments about your privacy rights, you may email us at
[${COMPANY.privacyEmail}](mailto:${COMPANY.privacyEmail}).

## {dnt} 10. CONTROLS FOR DO-NOT-TRACK FEATURES

Most web browsers and some mobile operating systems and mobile applications
include a Do-Not-Track ("DNT") feature or setting you can activate to signal your
privacy preference not to have data about your online browsing activities
monitored and collected. At this stage, no uniform technology standard for
recognizing and implementing DNT signals has been finalized. As such, we do not
currently respond to DNT browser signals or any other mechanism that automatically
communicates your choice not to be tracked online. If a standard for online
tracking is adopted that we must follow in the future, we will inform you about
that practice in a revised version of this Privacy Notice.

California law requires us to let you know how we respond to web browser DNT
signals. Because there currently is not an industry or legal standard for
recognizing or honoring DNT signals, we do not respond to them at this time.

**Global Privacy Control:** We recognize and honor Global Privacy Control (GPC)
signals. If you use a browser or extension that supports GPC, we will treat this
as a valid request to opt out of the sale or sharing of your personal information
for targeted advertising purposes under applicable state privacy laws, including
the California Consumer Privacy Act (CCPA). When we detect a GPC signal from your
browser, we will automatically apply your opt-out preference without requiring you
to take any additional action. For more information about GPC and how to enable
it, visit [globalprivacycontrol.org](https://globalprivacycontrol.org).

## {uslaws} 11. DO UNITED STATES RESIDENTS HAVE SPECIFIC PRIVACY RIGHTS?

> **In Short:** If you are a resident of California, Colorado, Connecticut,
> Delaware, Florida, Indiana, Iowa, Kentucky, Maryland, Minnesota, Montana,
> Nebraska, New Hampshire, New Jersey, Oregon, Rhode Island, Tennessee, Texas,
> Utah, or Virginia, you may have the right to request access to and receive
> details about the personal information we maintain about you and how we have
> processed it, correct inaccuracies, get a copy of, or delete your personal
> information. You may also have the right to withdraw your consent to our
> processing of your personal information. These rights may be limited in some
> circumstances by applicable law.

### Categories of Personal Information We Collect

The table below shows the categories of personal information we have collected in
the past twelve (12) months. The table includes illustrative examples of each
category and does not reflect the personal information we collect from you. For a
comprehensive inventory of all personal information we process, please refer to the
section "WHAT INFORMATION DO WE COLLECT?"

| Category | Examples | Collected |
|---|---|---|
| A. Identifiers | Contact details, such as real name, alias, postal address, telephone or mobile contact number, unique personal identifier, online identifier, Internet Protocol address, email address, and account name | NO |
| B. Personal information as defined in the California Customer Records statute | Name, contact information, education, employment, employment history, and financial information | NO |
| C. Protected classification characteristics under state or federal law | Gender, age, date of birth, race and ethnicity, national origin, marital status, and other demographic data | NO |
| D. Commercial information | Transaction information, purchase history, financial details, and payment information | NO |
| E. Biometric information | Fingerprints and voiceprints | NO |
| F. Internet or other similar network activity | Browsing history, search history, online behavior, interest data, and interactions with our and other websites, applications, systems, and advertisements | NO |
| G. Geolocation data | Device location | NO |
| H. Audio, electronic, sensory, or similar information | Images and audio, video or call recordings created in connection with our business activities | NO |
| I. Professional or employment-related information | Business contact details in order to provide you our Services at a business level or job title, work history, and professional qualifications if you apply for a job with us | NO |
| J. Education Information | Student records and directory information | NO |
| K. Inferences drawn from collected personal information | Inferences drawn from any of the collected personal information listed above to create a profile or summary about, for example, an individual's preferences and characteristics | NO |
| L. Sensitive personal Information | | NO |

We may also collect other personal information outside of these categories through
instances where you interact with us in person, online, or by phone or mail in the
context of:

- Receiving help through our customer support channels;
- Participation in customer surveys or contests; and
- Facilitation in the delivery of our Services and to respond to your inquiries.

### How We Use and Share Personal Information

**Will your information be shared with anyone else?**

We may disclose your personal information with our service providers pursuant to a
written contract between us and each service provider.

We may use your personal information for our own business purposes, such as for
undertaking internal research for technological development and demonstration.
This is not considered to be "selling" of your personal information.

We have not disclosed, sold, or shared any personal information to third parties
for a business or commercial purpose in the preceding twelve (12) months. We will
not sell or share personal information in the future belonging to website visitors,
users, and other consumers.

### Your Rights

You have rights under certain US state data protection laws. However, these rights
are not absolute, and in certain cases, we may decline your request as permitted by
law. These rights include:

- **Right to know** whether or not we are processing your personal data
- **Right to access** your personal data
- **Right to correct** inaccuracies in your personal data
- **Right to request** the deletion of your personal data
- **Right to obtain a copy** of the personal data you previously shared with us
- **Right to non-discrimination** for exercising your rights
- **Right to opt out** of the processing of your personal data if it is used for targeted advertising (or sharing as defined under California's privacy law), the sale of personal data, or profiling in furtherance of decisions that produce legal or similarly significant effects ("profiling")

Depending upon the state where you live, you may also have the following rights:

- Right to access the categories of personal data being processed (as permitted by applicable law, including the privacy law in Minnesota)
- Right to obtain a list of the categories of third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in California, Delaware, and Maryland)
- Right to obtain a list of specific third parties to which we have disclosed personal data (as permitted by applicable law, including the privacy law in Minnesota and Oregon)
- Right to obtain a list of third parties to which we have sold personal data (as permitted by applicable law, including the privacy law in Connecticut)
- Right to review, understand, question, and depending on where you live, correct how personal data has been profiled (as permitted by applicable law, including the privacy law in Connecticut and Minnesota)
- Right to limit use and disclosure of sensitive personal data (as permitted by applicable law, including the privacy law in California)
- Right to opt out of the collection of sensitive data and personal data collected through the operation of a voice or facial recognition feature (as permitted by applicable law, including the privacy law in Florida)

### How to Exercise Your Rights

To exercise these rights, you can contact us by submitting a
[data subject access request](${COMPANY.dsar}), by emailing us at
[${COMPANY.privacyEmail}](mailto:${COMPANY.privacyEmail}), or by referring to the
contact details at the bottom of this document.

We will honor your opt-out preferences if you enact the
[Global Privacy Control](https://globalprivacycontrol.org/) (GPC) opt-out signal on
your browser.

Under certain US state data protection laws, you can designate an authorized agent
to make a request on your behalf. We may deny a request from an authorized agent
that does not submit proof that they have been validly authorized to act on your
behalf in accordance with applicable laws.

### Request Verification

Upon receiving your request, we will need to verify your identity to determine you
are the same person about whom we have the information in our system. We will only
use personal information provided in your request to verify your identity or
authority to make the request. However, if we cannot verify your identity from the
information already maintained by us, we may request that you provide additional
information for the purposes of verifying your identity and for security or
fraud-prevention purposes.

If you submit the request through an authorized agent, we may need to collect
additional information to verify your identity before processing your request and
the agent will need to provide a written and signed permission from you to submit
such request on your behalf.

### Appeals

Under certain US state data protection laws, if we decline to take action regarding
your request, you may appeal our decision by emailing us at
[${COMPANY.privacyEmail}](mailto:${COMPANY.privacyEmail}). We will inform you in
writing of any action taken or not taken in response to the appeal, including a
written explanation of the reasons for the decisions. If your appeal is denied, you
may submit a complaint to your state attorney general.

## {otherlaws} 12. DO OTHER REGIONS HAVE SPECIFIC PRIVACY RIGHTS?

> **In Short:** You may have additional rights based on the country you reside in.

### Australia and New Zealand

We collect and process your personal information under the obligations and
conditions set by Australia's Privacy Act 1988 and New Zealand's Privacy Act 2020
(Privacy Act).

This Privacy Notice satisfies the notice requirements defined in both Privacy Acts,
in particular: what personal information we collect from you, from which sources,
for which purposes, and other recipients of your personal information.

If you do not wish to provide the personal information necessary to fulfill their
applicable purpose, it may affect our ability to provide our services, in
particular:

- offer you the products or services that you want
- respond to or help with your requests
- manage your account with us
- confirm your identity and protect your account

At any time, you have the right to request access to or correction of your personal
information. You can make such a request by contacting us by using the contact
details provided in the section "HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE
COLLECT FROM YOU?"

If you believe we are unlawfully processing your personal information, you have the
right to submit a complaint about a breach of the Australian Privacy Principles to
the [Office of the Australian Information Commissioner](https://www.oaic.gov.au/privacy/privacy-complaints/lodge-a-privacy-complaint-with-us)
and a breach of New Zealand's Privacy Principles to the
[Office of New Zealand Privacy Commissioner](https://www.privacy.org.nz/your-rights/making-a-complaint/).

### Republic of South Africa

At any time, you have the right to request access to or correction of your personal
information. You can make such a request by contacting us by using the contact
details provided in the section "HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE
COLLECT FROM YOU?"

If you are unsatisfied with the manner in which we address any complaint with
regard to our processing of personal information, you can contact the office of the
regulator, the details of which are:

[The Information Regulator (South Africa)](https://inforegulator.org.za/)

General enquiries: [enquiries@inforegulator.org.za](mailto:enquiries@inforegulator.org.za)

Complaints (complete POPIA/PAIA form 5):
[PAIAComplaints@inforegulator.org.za](mailto:PAIAComplaints@inforegulator.org.za)
and [POPIAComplaints@inforegulator.org.za](mailto:POPIAComplaints@inforegulator.org.za)

## {policyupdates} 13. DO WE MAKE UPDATES TO THIS NOTICE?

> **In Short:** Yes, we will update this notice as necessary to stay compliant
> with relevant laws.

We may update this Privacy Notice from time to time. The updated version will be
indicated by an updated "Revised" date at the top of this Privacy Notice. If we
make material changes to this Privacy Notice, we may notify you either by
prominently posting a notice of such changes or by directly sending you a
notification. We encourage you to review this Privacy Notice frequently to be
informed of how we are protecting your information.

## {contact} 14. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?

If you have questions or comments about this notice, you may email us at
[${COMPANY.privacyEmail}](mailto:${COMPANY.privacyEmail}) or contact us by post at:

${COMPANY.name}

${COMPANY.street}

${COMPANY.town}, ${COMPANY.province} ${COMPANY.postcode}

${COMPANY.country}

## {request} 15. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?

Based on the applicable laws of your country or state of residence in the US, you
may have the right to request access to the personal information we collect from
you, details about how we have processed it, correct inaccuracies, or delete your
personal information. You may also have the right to withdraw your consent to our
processing of your personal information. These rights may be limited in some
circumstances by applicable law. To request to review, update, or delete your
personal information, please fill out and submit a
[data subject access request](${COMPANY.dsar}).
`;

export const PRIVACY: LegalDoc = {
  path: "/privacy",
  title: "Privacy Policy",
  updated: "26 September 2026",
  contents: [
    { id: "infocollect", label: "1. What information do we collect?" },
    { id: "infouse", label: "2. How do we process your information?" },
    { id: "legalbases", label: "3. What legal bases do we rely on?" },
    { id: "whoshare", label: "4. When and with whom do we share it?" },
    { id: "ai", label: "5. Do we offer AI-based products?" },
    { id: "sociallogins", label: "6. How do we handle your social logins?" },
    { id: "inforetain", label: "7. How long do we keep your information?" },
    { id: "infosafe", label: "8. How do we keep your information safe?" },
    { id: "privacyrights", label: "9. What are your privacy rights?" },
    { id: "dnt", label: "10. Controls for do-not-track features" },
    { id: "uslaws", label: "11. Do United States residents have specific rights?" },
    { id: "otherlaws", label: "12. Do other regions have specific rights?" },
    { id: "policyupdates", label: "13. Do we make updates to this notice?" },
    { id: "contact", label: "14. How can you contact us?" },
    { id: "request", label: "15. How can you review, update, or delete your data?" },
  ],
  body,
};
