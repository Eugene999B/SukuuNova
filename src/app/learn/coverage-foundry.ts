import { catalogFor, type CognitiveChallenge, type LearnQuestion, type SessionConfig } from "./learn-domain";

type Concept = {
  term: string;
  definition: string;
  application: string;
  misconception: string;
  explanation: string;
};

type Profile = {
  id: string;
  concepts: readonly Concept[];
  contexts: readonly string[];
  mission: string;
};

type Target = {
  subjectId: string;
  subjectLabel: string;
  topicId: string;
  topicLabel: string;
};

const ACTORS = [
  "Ama","Kojo","Akosua","Kwame","Esi","Kofi","Adwoa","Yaw",
  "Abena","Kwaku","Efua","Kwesi","Amina","Ibrahim","Zainab","Fatima",
  "Nana","Sena","Mansa","Daniel","Mary","Joseph","Selina","Kobby",
  "Araba","Ekow","Naa","Nii","Afia","Kweku","Tetteh","Sarah",
] as const;

const MOMENTS = [
  "during a class activity","while checking a worked example","during a practical session","while preparing an assignment",
  "during revision","while comparing two solutions","during a group discussion","while checking a real-world example",
  "before presenting an answer","while correcting an earlier mistake","during an assessment review","while analysing new evidence",
  "during a project meeting","while explaining the idea to a classmate","during independent practice","while reviewing a case study",
] as const;

const STEMS = [
  "Which option best matches the idea?",
  "Which answer is most accurate?",
  "Which choice should the learner make?",
  "Which statement fits the concept?",
  "Which response shows the strongest understanding?",
  "Which option applies the principle correctly?",
  "Which answer would a careful learner choose?",
  "Which choice is supported by the information given?",
] as const;

function concept(
  term: string,
  definition: string,
  application: string,
  misconception: string,
  explanation: string,
): Concept {
  return { term, definition, application, misconception, explanation };
}

const PROFILES: readonly Profile[] = [
  {
    id: "number",
    mission: "Reason with quantities",
    contexts: ["a school shop","a household budget","a market survey","a savings club","a transport record","a class project","a small business","a sports event"],
    concepts: [
      concept("place value","the value of a digit depends on its position in a numeral","write 4,582 as 4,000 + 500 + 80 + 2","every digit keeps the same value wherever it appears","Place value links a digit to its position and the size represented by that position."),
      concept("ratio","a comparison of two quantities by division","compare 12 red items with 18 blue items as 2:3","a ratio is always the same thing as a subtraction","Ratios compare relative amounts and can be simplified by dividing both terms by a common factor."),
      concept("percentage","a proportion expressed out of one hundred","find 25% of 240 by multiplying 240 by 0.25","25% means adding 25 to the original number","A percentage is a rate per hundred and can be converted to a fraction or decimal."),
      concept("fraction","a number representing one or more equal parts of a whole","recognise 3/4 as three equal parts out of four","the numerator tells how many equal parts make the whole","The denominator gives the number of equal parts in the whole; the numerator gives the selected parts."),
      concept("estimation","finding a sensible approximate value","round values before checking whether a calculated total is reasonable","an estimate must be exactly equal to the final answer","Estimation gives an approximate value that is useful for checking reasonableness."),
      concept("order of operations","rules that determine which arithmetic operations are performed first","evaluate brackets before multiplication and addition","always work strictly from left to right regardless of operation","The order of operations prevents ambiguous arithmetic results."),
      concept("proportion","an equality between two ratios","scale a recipe by multiplying all quantities by the same factor","change only one part of an equivalent ratio","Proportional reasoning preserves the same multiplicative relationship."),
      concept("unit conversion","expressing the same measurement using another compatible unit","convert 2.5 metres to 250 centimetres","change units without changing the numerical value","A correct conversion changes the number and unit together while preserving the same quantity."),
    ],
  },
  {
    id: "algebra",
    mission: "Model relationships",
    contexts: ["a maths lesson","a pricing model","a distance problem","a science calculation","a budgeting exercise","an engineering worksheet","a data model","a classroom puzzle"],
    concepts: [
      concept("variable","a symbol used to represent a value that can vary or be unknown","let x represent the unknown number of items","a variable must always have the value zero","Variables allow unknown or changing quantities to be represented symbolically."),
      concept("expression","a mathematical phrase made of numbers, variables and operations without an equals sign","simplify 3x + 2x to 5x","an expression must contain an equals sign","Expressions represent quantities; equations state that two expressions are equal."),
      concept("equation","a statement that two expressions are equal","solve 2x + 3 = 11 by preserving equality on both sides","change only one side of an equation without affecting equality","Solving an equation means finding values that make both sides equal."),
      concept("inequality","a comparison showing one quantity is greater than, less than, or not equal to another","represent x > 5 on a number line","treat the greater-than sign exactly like an equals sign in every step","Inequalities describe ranges of possible values rather than a single equality."),
      concept("function","a rule that assigns each allowed input exactly one output","use f(x)=2x+1 to calculate the output for a chosen x","allow one input to produce two different outputs in the same function","A function maps each input in its domain to exactly one output."),
      concept("substitution","replacing a variable with a known value","replace x with 4 in 3x+2 before calculating","change the coefficient when inserting a value","Substitution evaluates an expression or formula by replacing variables with given values."),
      concept("factor","a quantity that multiplies another quantity to form a product","factor 6x+12 as 6(x+2)","add terms and call the result a factorisation","Factorisation rewrites an expression as a product of factors."),
      concept("gradient","the rate of change of a straight line","calculate rise divided by run between two points","find gradient by adding the two coordinates","Gradient measures how much one variable changes relative to another."),
    ],
  },
  {
    id: "geometry",
    mission: "Reason with shape and measure",
    contexts: ["a building plan","a classroom floor","a sports field","a design drawing","a land survey","a packaging task","a construction project","a map exercise"],
    concepts: [
      concept("perimeter","the total distance around a two-dimensional shape","add all outer side lengths of a rectangle","multiply length by width to get perimeter","Perimeter measures boundary length."),
      concept("area","the amount of two-dimensional surface covered","multiply rectangle length by width","add all side lengths and call the result area","Area measures surface in square units."),
      concept("volume","the amount of three-dimensional space occupied","multiply length, width and height for a rectangular prism","use square units for a three-dimensional volume","Volume measures three-dimensional space in cubic units."),
      concept("angle","the amount of turn between two rays meeting at a point","use 90° to identify a right angle","measure an angle in square centimetres","Angles describe rotation and are commonly measured in degrees or radians."),
      concept("similarity","same shape with corresponding lengths in a constant ratio","use a scale factor to find a missing side in similar figures","assume similar shapes must also be exactly the same size","Similar figures have equal corresponding angles and proportional corresponding sides."),
      concept("Pythagorean theorem","for a right triangle, the square of the hypotenuse equals the sum of the squares of the other two sides","use a²+b²=c² to find a missing right-triangle side","apply a²+b²=c² to every triangle regardless of angle","The Pythagorean theorem applies specifically to right triangles."),
      concept("scale","a fixed relationship between a representation and actual size","convert a 1:100 drawing length to its real length","change different dimensions by different scale factors","A scale applies the same proportional relationship throughout a representation."),
      concept("coordinate","an ordered value locating a point relative to axes","plot (3, -2) by moving 3 horizontally and -2 vertically","swap x and y coordinates without changing the point","Coordinates locate positions in a defined reference system."),
    ],
  },
  {
    id: "statistics",
    mission: "Interpret data and uncertainty",
    contexts: ["a class survey","a health study","a business dashboard","a sports dataset","a research sample","a quality-control report","a population study","an experiment"],
    concepts: [
      concept("mean","the arithmetic average obtained by dividing the total by the number of observations","add all observations and divide by how many there are","choose the most frequent value and call it the mean","The mean uses every observation in the dataset."),
      concept("median","the middle value after ordered observations are arranged","order the data before locating the central observation","find the median without ordering the data","The median is based on ordered position and is resistant to extreme values."),
      concept("mode","the value occurring most frequently","identify the most common response in a survey","add all values and divide by the count","The mode is determined by frequency."),
      concept("range","the difference between the maximum and minimum values","subtract the smallest value from the largest","add the minimum and maximum to get range","Range is a simple measure of spread."),
      concept("probability","a numerical description of how likely an event is","represent an impossible event by 0 and a certain event by 1","use probabilities below 0 or above 1 for ordinary events","Probabilities lie from 0 to 1 inclusive."),
      concept("sample","a subset of a population studied to learn about the wider population","select participants from the target population","treat one convenient person as automatically representative","A sample should be chosen in a way that supports the intended inference."),
      concept("correlation","an association between two variables","describe variables that tend to move together without automatically claiming causation","conclude that correlation alone proves one variable causes the other","Correlation measures association, not by itself causation."),
      concept("standard deviation","a measure of how spread observations are around their mean","compare consistency of two datasets using their spread","interpret a larger standard deviation as less variability","Standard deviation increases as observations are more dispersed around the mean."),
    ],
  },
  {
    id: "language",
    mission: "Read, write and communicate clearly",
    contexts: ["an essay draft","a reading passage","a speech","a newspaper article","a classroom discussion","a formal letter","a report","a story"],
    concepts: [
      concept("subject-verb agreement","the verb form must agree in number and person with its grammatical subject","write 'The students are ready' rather than 'The students is ready'","choose the verb only from the noun nearest to it","Agreement follows the grammatical subject, not simply the closest noun."),
      concept("context clue","information around an unfamiliar word that helps infer its meaning","use surrounding sentences to infer an unknown word","ignore the sentence and guess from the first letter","Context can provide definitions, examples, contrasts or consequences that clarify meaning."),
      concept("main idea","the central point a text develops","summarise the key message supported by the paragraph","select a minor example and call it the whole main idea","The main idea captures the central point rather than a single supporting detail."),
      concept("inference","a conclusion drawn from evidence plus reasoning","combine textual clues with what is logically implied","state an unsupported guess as though the text proved it","A sound inference must be supported by evidence."),
      concept("paragraph unity","all sentences in a paragraph contribute to one controlling idea","remove a sentence that is unrelated to the paragraph focus","add unrelated facts simply to make the paragraph longer","Unity keeps a paragraph focused on its controlling idea."),
      concept("thesis statement","the central claim or controlling idea of an extended piece of writing","state the essay's main position clearly enough to guide the discussion","list every source without expressing a central claim","A thesis tells the reader what the writing will argue or develop."),
      concept("punctuation","marks that organise written language and clarify relationships","use a full stop to end a complete declarative sentence","remove punctuation where it is necessary to distinguish sentence structure","Punctuation helps readers interpret boundaries, pauses and relationships."),
      concept("register","language choices suited to audience, purpose and situation","use appropriately formal wording in an official letter","use exactly the same style for a private text and a formal report","Register changes with context, audience and purpose."),
    ],
  },
  {
    id: "computing",
    mission: "Think computationally",
    contexts: ["a software project","a school app","a mobile-money system","a website","a data-processing task","a coding exercise","an automation script","a digital service"],
    concepts: [
      concept("algorithm","a finite sequence of well-defined steps for solving a problem","write ordered steps before implementing a solution","use a process with no defined end and call it a complete algorithm","An algorithm describes an unambiguous procedure that terminates for the intended task."),
      concept("variable","a named storage location or binding for a value","store a changing score in a variable","hard-code every changing value in many separate places","Variables make values easier to reuse and update."),
      concept("conditional","logic that selects actions according to whether a condition is true or false","use an if statement to choose between outcomes","repeat a block forever when only a decision is needed","Conditionals implement branching decisions."),
      concept("loop","a structure that repeats a block of work","iterate through each item in a list","duplicate the same statement hundreds of times instead of using controlled repetition","Loops express repeated computation concisely."),
      concept("function","a reusable named block that performs a defined task","place repeated calculation logic in a function with inputs","copy the same logic everywhere so changes must be made many times","Functions support reuse, decomposition and clearer interfaces."),
      concept("data structure","an organised way to store and access data","choose a queue when first-in-first-out behaviour is required","choose structures without considering required operations","Data structures are selected according to how information must be stored, retrieved and updated."),
      concept("debugging","systematically finding and correcting defects","reproduce an error and inspect the relevant state","change many unrelated lines randomly until the error disappears","Debugging is evidence-driven fault isolation and correction."),
      concept("abstraction","hiding unnecessary detail behind a useful representation or interface","use a function interface without exposing every internal step","make every internal implementation detail mandatory for every caller","Abstraction reduces complexity by focusing on relevant behaviour."),
    ],
  },
  {
    id: "networks",
    mission: "Understand connected systems",
    contexts: ["a campus network","an office network","a cloud service","a home router","a school computer lab","a mobile service","a data centre","an internet connection"],
    concepts: [
      concept("IP address","a logical network address used to identify an interface for IP communication","configure devices with addresses from the correct network","treat an IP address as the same thing as a user's password","IP addressing supports routing and delivery across IP networks."),
      concept("router","a device that forwards packets between different networks","send traffic from a local network toward another network","use a router only to store documents","Routers make forwarding decisions between networks."),
      concept("switch","a device that forwards frames within a local network using link-layer information","connect hosts on the same LAN efficiently","use a switch as though it were an internet domain name","Switches connect devices within local networks."),
      concept("protocol","an agreed set of rules for communication","use HTTP rules for web request-response communication","allow each endpoint to invent incompatible message rules during a conversation","Protocols let independent systems communicate predictably."),
      concept("bandwidth","the capacity of a communication link to carry data over time","compare links by the amount of data they can carry per second","treat bandwidth and delay as exactly the same quantity","Bandwidth concerns capacity; latency concerns delay."),
      concept("latency","the time delay between sending and receiving data or a response","measure round-trip delay for an interactive service","assume a high-bandwidth link always has zero delay","Latency measures delay and can matter even when bandwidth is high."),
      concept("encryption","transforming information so authorised parties with the proper key can recover it","protect data in transit from readable interception","publish the encryption key beside the protected secret","Encryption protects confidentiality when keys are managed securely."),
      concept("authentication","verifying an asserted identity","require a user to prove identity before granting account access","treat knowing a public username as proof of identity","Authentication establishes identity before authorisation decisions."),
    ],
  },
  {
    id: "chemistry",
    mission: "Reason about matter and reactions",
    contexts: ["a chemistry laboratory","a water-testing lab","a pharmacy lab","a food-science lab","an industrial process","a school practical","an environmental test","a materials lab"],
    concepts: [
      concept("atom","the smallest unit of an element that retains that element's chemical identity","represent an element as atoms containing protons, neutrons and electrons","call a mixture of substances a single atom","Atoms are the basic chemical units of elements."),
      concept("molecule","two or more atoms held together by chemical bonds as a discrete unit","recognise H₂O as a molecule containing hydrogen and oxygen atoms","describe an isolated proton as a complete molecule","Molecules are bonded groups of atoms."),
      concept("mole","an amount of substance containing Avogadro's number of specified entities","convert amount in moles to particles using Avogadro's constant","treat one mole as one individual particle","The mole connects microscopic particle counts to measurable amounts."),
      concept("concentration","the amount of solute relative to a specified amount of solution or solvent","calculate molar concentration as moles per litre of solution","increase solution volume and assume concentration must always increase","Concentration describes how much solute is present relative to volume or mass."),
      concept("acid","a species that can donate a proton in Brønsted-Lowry theory","identify HCl donating H⁺ in water","define every substance containing hydrogen as an acid","Acid-base behaviour depends on chemical reactions, not just formula appearance."),
      concept("base","a species that can accept a proton in Brønsted-Lowry theory","identify a proton acceptor in an acid-base reaction","assume every base must be insoluble","Bases are defined by reaction behaviour such as proton acceptance."),
      concept("oxidation","loss of electrons or an increase in oxidation state","identify a species that loses electrons as oxidised","call electron gain oxidation","Oxidation and reduction involve paired electron-transfer changes."),
      concept("equilibrium","a dynamic state where forward and reverse reaction rates are equal","recognise that reactions can continue microscopically at equilibrium","assume all molecular change stops at equilibrium","Chemical equilibrium is dynamic even though macroscopic composition can remain constant."),
    ],
  },
  {
    id: "biology",
    mission: "Explain living systems",
    contexts: ["a biology laboratory","a field study","a health lesson","a farm investigation","a genetics exercise","an ecology survey","a microscopy practical","a plant experiment"],
    concepts: [
      concept("cell","the basic structural and functional unit of living organisms","use microscopy to compare cell structures","describe a tissue as a single cell","Cells are the fundamental units from which organisms are built."),
      concept("gene","a DNA sequence that contributes to a functional product and inherited information","relate an inherited variant to a gene locus","treat every visible trait as controlled by one gene only","Genes contribute to traits through expression and interaction with other genes and environments."),
      concept("enzyme","a biological catalyst that increases reaction rate without being consumed","explain how temperature or pH can affect enzyme activity","assume an enzyme changes the final equilibrium position simply because it speeds a reaction","Enzymes lower activation barriers and affect reaction rates."),
      concept("homeostasis","regulation that keeps internal conditions within viable ranges","use feedback to regulate body temperature","keep every internal variable absolutely constant with no variation","Homeostasis maintains controlled ranges rather than perfect unchanging values."),
      concept("ecosystem","organisms and their physical environment interacting as a system","study energy flow between organisms and their environment","study one isolated organism and ignore all interactions while calling it the whole ecosystem","Ecosystems include biotic and abiotic components and their interactions."),
      concept("adaptation","an inherited characteristic shaped by selection that improves reproductive success in an environment","explain how a heritable trait can become more common over generations","call any temporary individual adjustment an evolutionary adaptation","Evolutionary adaptations are population-level inherited outcomes across generations."),
      concept("cellular respiration","processes that release usable energy from organic molecules","link glucose oxidation to ATP production","describe respiration as identical to breathing","Cellular respiration is biochemical energy conversion; breathing is gas movement."),
      concept("photosynthesis","conversion of light energy into chemical energy in photosynthetic organisms","relate light capture to carbohydrate production","claim plants obtain all their biomass directly from soil minerals","Photosynthesis builds energy-rich organic molecules using light, carbon dioxide and water."),
    ],
  },
  {
    id: "health",
    mission: "Apply health-science reasoning",
    contexts: ["a teaching hospital","a clinic","a nursing station","a public-health programme","a pharmacy","a clinical-skills lab","a community health centre","a diagnostic unit"],
    concepts: [
      concept("infection prevention","measures that reduce transmission of infectious agents","perform appropriate hand hygiene before and after patient contact","reuse contaminated equipment without decontamination","Infection prevention combines hygiene, aseptic practice, appropriate protective equipment and safe systems."),
      concept("vital signs","basic physiological measurements used to assess current status","interpret temperature, pulse, respiration and blood pressure in clinical context","treat one isolated measurement as a complete diagnosis","Vital signs are screening and monitoring data that require context and trends."),
      concept("triage","prioritising care according to urgency and clinical risk","attend first to a patient with immediate life-threatening compromise","serve patients only in arrival order regardless of severity","Triage directs limited resources toward the most urgent needs first."),
      concept("informed consent","voluntary agreement after adequate information and capacity to decide","explain material benefits, risks and alternatives before a competent patient decides","obtain a signature without meaningful information and call that sufficient consent","Valid consent requires information, capacity and voluntariness."),
      concept("dose","a specified quantity of a medicine given at one time or over a stated period","calculate administered amount from prescribed dose and available concentration","ignore units when calculating medication amounts","Dose calculations require compatible units and the prescribed amount."),
      concept("incidence","the occurrence of new cases in a population over a period","count new cases during the observation interval","include all old and new cases and call the result incidence","Incidence concerns new events arising during a defined time period."),
      concept("prevalence","the proportion of a population with a condition at a point or period","count existing cases relative to the population","count only newly diagnosed cases and call it prevalence","Prevalence describes how common an existing condition is."),
      concept("clinical evidence","information from systematic observation or research used with expertise and patient context","compare treatment choices using trustworthy evidence plus individual circumstances","choose care solely from an unsupported anecdote","Evidence-informed care integrates research evidence, clinical expertise and patient values."),
    ],
  },
  {
    id: "law",
    mission: "Reason from legal principles",
    contexts: ["a contract dispute","a criminal case","a constitutional question","a land dispute","a commercial transaction","a civil claim","a courtroom problem","a legal opinion"],
    concepts: [
      concept("precedent","an earlier judicial decision that may guide later cases under the applicable doctrine","compare material facts with an authoritative earlier case","treat every earlier decision from any court as equally binding","The force of precedent depends on hierarchy, jurisdiction and the legal issue."),
      concept("offer","a sufficiently definite proposal intended to become binding on acceptance","identify a clear proposal capable of acceptance","treat every advertisement automatically as a contractual offer","An offer must show objective willingness to be bound on stated terms."),
      concept("acceptance","final and unqualified assent to the terms of an offer","communicate agreement in the required or authorised manner","change important terms and still call the response an unconditional acceptance","A purported acceptance that changes terms is generally a counter-offer rather than matching acceptance."),
      concept("consideration","something of legal value exchanged as part of a bargain in common-law contract analysis","identify the promised price or return performance supporting a bargain","assume consideration must always be money","Consideration can take forms other than money and concerns bargained-for legal value."),
      concept("duty of care","a legal obligation to take reasonable care where the law recognises such a duty","analyse whether a defendant owed the claimant reasonable care","assume every unfortunate event automatically creates negligence liability","Negligence requires recognised elements including duty, breach, causation and damage."),
      concept("burden of proof","the obligation to establish a disputed proposition to the applicable standard","identify which party must prove an element","treat burden of proof as the same thing as the final judgment","The burden identifies who must establish facts and may interact with different standards of proof."),
      concept("jurisdiction","the legal authority of a court or body to hear and decide a matter","check whether the tribunal has authority over the case","ignore territorial and subject-matter limits","A decision-maker must act within the jurisdiction granted by law."),
      concept("remedy","the legal relief available after a right is established or wrong is proven","consider damages, injunction or another appropriate order","treat liability and remedy as identical questions","Remedies determine the form of legal relief after substantive rights and liabilities are addressed."),
    ],
  },
  {
    id: "accounting",
    mission: "Read financial information",
    contexts: ["a retail business","a manufacturing firm","a service company","a school enterprise","a transport company","a trading company","a small business","a finance office"],
    concepts: [
      concept("asset","a present economic resource controlled by an entity as a result of past events","classify cash or equipment controlled by the business as an asset","classify every future hope as a current asset","Assets are controlled economic resources capable of producing benefits."),
      concept("liability","a present obligation to transfer an economic resource because of past events","recognise an unpaid supplier obligation as a liability","call all owner investment a liability to an external creditor","Liabilities represent present obligations of the entity."),
      concept("equity","the residual interest in assets after deducting liabilities","use Assets − Liabilities to reason about equity","calculate equity by adding liabilities to assets","Equity is the residual claim after liabilities are deducted."),
      concept("revenue","income arising from ordinary activities such as sales or service fees","recognise earned sales income as revenue","treat a bank loan received as sales revenue","Borrowing creates a liability rather than operating revenue."),
      concept("expense","a decrease in economic benefits associated with generating activity during a period","recognise wages or utilities consumed in operations as expenses","record the purchase of a long-lived asset entirely as an operating expense without considering capitalisation","Expenses reflect resources consumed or obligations incurred in earning income."),
      concept("double entry","recording each transaction with equal debit and credit effects","post both sides of a transaction so total debits equal total credits","record only the account receiving value","Double entry maintains the accounting equation through balanced entries."),
      concept("accrual","recognising economic events when they are earned or incurred rather than only when cash moves","record revenue when earned even if cash is collected later","record every event only when bank cash changes","Accrual accounting separates economic recognition from cash timing."),
      concept("cash flow","actual inflows and outflows of cash and cash equivalents","distinguish profitable sales on credit from immediate cash receipts","assume accounting profit and net cash flow are always identical","Profit measurement and cash movement are related but different."),
    ],
  },
  {
    id: "business",
    mission: "Make sound organisational decisions",
    contexts: ["a startup","a retail company","a manufacturing team","a logistics firm","a school enterprise","a service business","a project team","a growing company"],
    concepts: [
      concept("planning","setting objectives and deciding actions in advance","define a target and choose steps, resources and timing before execution","wait until the work is finished before deciding what the objective was","Planning establishes direction before action."),
      concept("organising","arranging people, tasks and resources to carry out plans","assign responsibilities and coordinate resources","leave roles undefined and assume coordination will happen automatically","Organising turns plans into workable structures and responsibilities."),
      concept("leading","influencing and supporting people toward shared objectives","communicate direction, motivate and support a team","treat leadership as only issuing orders without feedback","Leading involves influence, communication and motivation."),
      concept("controlling","comparing actual performance with standards and taking corrective action","measure results against targets and respond to material deviations","set targets but never review results","Control closes the management loop through measurement and correction."),
      concept("stakeholder","a person or group that can affect or is affected by an organisation","consider employees, customers, owners and regulators in a decision","assume only shareholders can ever be stakeholders","Stakeholder analysis considers multiple affected or influential groups."),
      concept("productivity","output produced relative to inputs used","compare output per labour hour before and after a process change","measure productivity only by total output without considering inputs","Productivity is an efficiency relationship between outputs and inputs."),
      concept("break-even point","the activity level where total revenue equals total cost","compare fixed cost with contribution per unit to find units needed to break even","call the highest possible profit the break-even point","At break-even there is neither operating profit nor operating loss."),
      concept("strategy","a coherent set of choices about how an organisation will achieve long-term objectives","choose where to compete and how to create advantage","treat a single routine task as the whole organisational strategy","Strategy connects long-term goals with coordinated choices and resource allocation."),
    ],
  },
  {
    id: "economics",
    mission: "Explain choices and markets",
    contexts: ["a local market","a national economy","a household decision","a business sector","a labour market","an agricultural market","a policy discussion","an international market"],
    concepts: [
      concept("opportunity cost","the value of the best alternative forgone when a choice is made","identify what must be given up to choose one option","add all possible alternatives together and call that opportunity cost","Opportunity cost focuses on the next-best forgone alternative."),
      concept("demand","the quantities consumers are willing and able to buy at different prices, other things equal","analyse how quantity demanded changes when price changes","treat desire without ability to purchase as market demand","Demand combines willingness and ability to purchase."),
      concept("supply","the quantities producers are willing and able to offer at different prices, other things equal","analyse producer response to price incentives","define supply as whatever consumers want to buy","Supply concerns seller willingness and ability to offer goods or services."),
      concept("market equilibrium","a price-quantity combination where quantity demanded equals quantity supplied","find the intersection of demand and supply","call any shortage an equilibrium","At equilibrium planned purchases and planned sales are equal under the model."),
      concept("elasticity","responsiveness of one economic variable to a change in another","compare percentage change in quantity with percentage change in price","use only absolute unit changes when comparing responsiveness across differently scaled markets","Elasticity is generally expressed using proportional or percentage changes."),
      concept("inflation","a sustained increase in the general price level","track a broad price index across time","call a one-off increase in one product's price economy-wide inflation","Inflation concerns the general price level rather than a single isolated price."),
      concept("GDP","the market value of final goods and services produced within an economy over a period","avoid double-counting intermediate goods when estimating production","add every resale of existing assets to current production","GDP is a measure of current final production within a geographic economy."),
      concept("externality","a cost or benefit from an activity that falls on third parties outside the market transaction","analyse pollution imposed on nearby residents","assume every private cost paid by the buyer is an externality","Externalities are effects on parties not fully reflected in the transaction price."),
    ],
  },
  {
    id: "finance",
    mission: "Reason about money, time and risk",
    contexts: ["an investment portfolio","a savings plan","a business loan","a bank","a corporate project","a pension fund","a household investment","a financial market"],
    concepts: [
      concept("compound interest","interest calculated on principal plus previously accumulated interest","grow an investment by repeatedly applying the periodic rate","calculate every multi-period investment using simple interest only","Compounding earns returns on earlier returns as well as the original principal."),
      concept("present value","the current equivalent of a future cash flow discounted at a required rate","discount a future payment back to today","add a discount rate to a future amount to obtain present value","Present value accounts for the time value of money by discounting future cash flows."),
      concept("risk-return trade-off","the principle that investors generally require higher expected return for bearing more risk","compare expected return together with uncertainty","choose an investment from expected return alone and ignore risk","Investment decisions evaluate return in relation to risk."),
      concept("diversification","spreading exposure across imperfectly related investments to reduce idiosyncratic risk","hold different assets rather than concentrating everything in one issuer","buy more units of the same single risky asset and call that diversification","Diversification reduces concentration risk when exposures are not perfectly correlated."),
      concept("liquidity","the ease with which an asset can be converted to cash with limited loss of value","compare cash with a difficult-to-sell specialised asset","treat a highly illiquid asset as immediately spendable cash","Liquidity concerns speed and cost of conversion to cash."),
      concept("leverage","use of borrowed funds or fixed financing obligations to amplify exposure","recognise that debt can magnify both gains and losses to owners","assume more debt always reduces financial risk","Leverage can increase potential returns but also increases financial risk."),
      concept("net present value","present value of expected inflows minus present value of expected outflows","accept a project under the usual rule when NPV is positive","compare undiscounted totals when timing differs substantially","NPV discounts cash flows to a common date before comparing benefits and costs."),
      concept("cash flow","movement of cash into and out of an entity or investment","forecast when receipts and payments actually occur","treat non-cash accounting entries as immediate bank movements","Cash-flow analysis focuses on timing and amount of cash movements."),
    ],
  },
  {
    id: "research",
    mission: "Evaluate evidence",
    contexts: ["a university study","a school research project","a clinical trial","a market survey","a field investigation","a laboratory study","a policy evaluation","a dissertation"],
    concepts: [
      concept("hypothesis","a testable proposition about an expected relationship or difference","state a prediction that can be confronted with evidence","write a claim that cannot possibly be tested and call it an empirical hypothesis","Research hypotheses should be framed so evidence can support or challenge them."),
      concept("independent variable","a predictor or factor manipulated or used to explain variation in an outcome","identify the factor deliberately changed in an experiment","call the measured outcome the independent variable","The independent variable is the explanatory or manipulated factor."),
      concept("dependent variable","the outcome measured to assess response to explanatory factors","measure performance after changing a teaching method","call the manipulated treatment the dependent variable","The dependent variable is the measured response."),
      concept("random sampling","selecting population members using a chance-based procedure","use a random mechanism to choose participants from a sampling frame","let volunteers self-select and call that simple random sampling","Random sampling concerns how units are selected from a population."),
      concept("random assignment","allocating study participants to conditions by chance","randomly assign enrolled participants to treatment and control groups","use random assignment as a substitute for population sampling","Random assignment helps balance groups for causal comparisons; it is distinct from sampling."),
      concept("reliability","consistency or repeatability of a measurement process","check whether repeated measurement gives stable results under similar conditions","assume a consistent measure must automatically measure the correct construct","Reliability concerns consistency, while validity concerns whether the intended construct is measured."),
      concept("validity","the extent to which evidence and interpretation support the intended measurement or inference","check whether an instrument actually measures the construct of interest","assume reliability alone guarantees validity","Validity concerns the appropriateness of the intended interpretation or conclusion."),
      concept("confounder","a third factor associated with both an explanatory factor and outcome that can distort an observed relationship","control or adjust for a plausible alternative explanation","ignore a variable that changes with both treatment exposure and outcome","Confounding can create or mask associations if not addressed."),
    ],
  },
  {
    id: "engineering",
    mission: "Apply engineering principles",
    contexts: ["a bridge project","a machine workshop","a power system","a manufacturing line","a building design","a water system","a robotics project","a transport system"],
    concepts: [
      concept("load","an external force or demand applied to a component or system","identify forces a structural member must carry","treat material strength as though it were the applied load","Loads are external actions; strength is a resistance property."),
      concept("stress","internal force intensity, commonly force divided by cross-sectional area","calculate axial stress from force and area","multiply force by area when the definition requires force per area","Stress measures internal force intensity within material."),
      concept("strain","deformation relative to original dimension","divide change in length by original length for normal strain","report strain as though it were an applied force","Strain describes relative deformation."),
      concept("torque","turning effect of a force about an axis","multiply force by perpendicular lever arm for simple torque","use only the mass of an object without considering lever arm or force","Torque depends on force and perpendicular distance from the axis."),
      concept("efficiency","useful output divided by input, usually expressed as a proportion or percentage","compare useful energy output with supplied energy","report efficiency above 100% for an ordinary energy-conversion device without additional input","Efficiency tracks how much input becomes useful output."),
      concept("feedback","using information about system output to influence subsequent control action","adjust a controller using measured error","operate a closed-loop controller without any output information","Feedback enables a controller to respond to deviation from desired behaviour."),
      concept("tolerance","permitted variation from a specified dimension or performance target","state acceptable upper and lower dimensional limits","require every manufactured dimension to be mathematically exact with zero allowable variation","Tolerance recognises controlled manufacturing variation."),
      concept("factor of safety","ratio providing margin between failure capacity and intended demand under a stated definition","design with capacity above expected working load","set design capacity exactly equal to uncertain maximum demand with no margin","A factor of safety provides margin for uncertainty and variation."),
    ],
  },
  {
    id: "social",
    mission: "Analyse society and institutions",
    contexts: ["a community meeting","a national policy debate","a local government","a classroom discussion","a development project","a civic organisation","a historical case","a public institution"],
    concepts: [
      concept("governance","processes and institutions through which collective decisions are made and implemented","examine accountability, participation and decision procedures","reduce governance to elections alone","Governance includes how authority is exercised, decisions are implemented and institutions are held accountable."),
      concept("citizenship","membership in a political community with associated rights and responsibilities","connect civic rights with responsibilities and participation","treat citizenship only as residence at a location","Citizenship combines legal status, rights, responsibilities and civic participation."),
      concept("institution","an established set of rules, norms or organisations structuring social behaviour","analyse how courts, schools or family systems organise behaviour","call every temporary individual preference a social institution","Institutions are durable structures or rule systems shaping social interaction."),
      concept("culture","shared learned meanings, practices, symbols and values within groups","compare how norms influence behaviour across communities","treat culture as biologically inherited and unchanging","Culture is learned, shared and capable of change."),
      concept("inequality","unequal distribution of resources, opportunities, status or power","compare access to education or income across groups","assume every difference between individuals is automatically unjust inequality of the same kind","Social inequality concerns patterned differences in resources, opportunity, status or power."),
      concept("public policy","a course of government action or inaction addressing public issues","evaluate a policy's goals, instruments, implementation and effects","treat a private household decision as government policy","Public policy concerns authoritative choices addressing collective problems."),
      concept("development","multidimensional improvement in wellbeing, capabilities and productive or institutional conditions","consider health, education and income alongside economic output","equate development only with growth in one monetary statistic","Development is broader than economic growth alone."),
      concept("participation","involvement of affected people in civic or organisational decision processes","create meaningful routes for community input","announce a completed decision after the fact and call it full participation","Participation involves opportunities to influence decisions rather than merely receive information."),
    ],
  },
  {
    id: "psychology",
    mission: "Explain behaviour and mental processes",
    contexts: ["a learning study","a counselling setting","a workplace","a classroom","a developmental study","a memory experiment","a social situation","a health-behaviour programme"],
    concepts: [
      concept("cognition","mental processes involved in acquiring, representing and using information","study attention, memory, reasoning or decision-making","define cognition only as visible muscle movement","Cognition includes processes such as perception, memory, language and reasoning."),
      concept("conditioning","learning through associations between events or between behaviour and consequences","analyse behaviour change following reinforcement","assume all learning happens without experience or consequences","Conditioning theories explain forms of learning through associations and consequences."),
      concept("working memory","a limited-capacity system for temporarily holding and manipulating information","keep intermediate steps active while solving a problem","treat working memory as unlimited permanent storage","Working memory supports temporary active processing and has limited capacity."),
      concept("motivation","processes that energise, direct and sustain goal-oriented behaviour","examine incentives, goals and intrinsic interest","assume behaviour can never be influenced by goals or rewards","Motivation concerns why behaviour starts, is directed and persists."),
      concept("development","systematic change in abilities and behaviour across the lifespan","compare cognitive or social change at different ages","assume development ends completely after childhood","Developmental psychology studies change and continuity across the lifespan."),
      concept("personality","relatively enduring patterns of thought, feeling and behaviour","use validated measures to study stable trait differences","infer an entire personality from one isolated action","Personality descriptions concern patterns across situations and time."),
      concept("cognitive bias","a systematic tendency in judgement or information processing","check whether confirmation bias is shaping evidence selection","call every individual mistake a well-established cognitive bias","Biases are systematic patterns rather than any random error."),
      concept("ethics","principles protecting rights, welfare and integrity in psychological practice and research","protect confidentiality and obtain appropriate consent","disclose private client information casually without justification","Ethical practice balances scientific or professional aims with participant and client rights."),
    ],
  },
  {
    id: "education",
    mission: "Improve teaching and learning",
    contexts: ["a classroom","a lesson-planning meeting","a school assessment","a teaching practicum","an inclusive classroom","a curriculum review","a tutoring session","a learning intervention"],
    concepts: [
      concept("learning objective","a clear statement of what learners should know or be able to do","write an observable outcome aligned with lesson activities","state only what the teacher will do and call that the learner objective","Objectives focus teaching, learning activities and assessment on intended outcomes."),
      concept("formative assessment","assessment used during learning to generate feedback for improvement","use a quick check to adjust teaching before the unit ends","wait until the final grade before providing any information for improvement","Formative assessment informs next steps while learning is still taking place."),
      concept("summative assessment","assessment used to judge achievement at the end of a defined period or unit","use a final examination to summarise attainment","use every informal question during a lesson only for final certification","Summative assessment primarily evaluates achievement after learning activity."),
      concept("scaffolding","temporary support that helps a learner perform beyond what they can yet do independently","provide prompts and gradually remove them as competence grows","keep the same full support permanently regardless of progress","Scaffolding is adjusted and faded as learner independence increases."),
      concept("differentiation","adapting teaching, tasks or support in response to learner needs while preserving meaningful goals","vary support or representation for learners who need different access routes","give every learner identical support regardless of evidence about need","Differentiation responds to learner readiness, profile or barriers."),
      concept("feedback","information about performance that helps a learner improve future work","identify what was successful and what specific next action is needed","give only a score with no indication of how to improve","Effective feedback is timely, specific and actionable."),
      concept("inclusion","designing learning so diverse learners can participate meaningfully","remove unnecessary barriers and provide reasonable support","exclude learners whenever they need a different access method","Inclusive practice anticipates diversity and supports participation."),
      concept("classroom management","organising routines, relationships, expectations and responses to support learning","establish clear routines and consistent expectations","rely only on punishment after problems occur","Effective management is proactive as well as responsive."),
    ],
  },
  {
    id: "agriculture",
    mission: "Reason about agricultural systems",
    contexts: ["a crop farm","a livestock unit","a school garden","an agribusiness","an irrigation project","a soil test","a fisheries project","a farm-management plan"],
    concepts: [
      concept("soil fertility","the soil's capacity to supply nutrients and conditions needed for plant growth","use soil testing and appropriate amendments to manage nutrients","assume dark colour alone proves every nutrient is sufficient","Fertility depends on nutrient availability and other soil conditions."),
      concept("crop rotation","planned sequence of different crops on the same land over time","rotate crop families to help manage pests and soil resources","grow the same susceptible crop continuously and call it rotation","Rotation changes crops over seasons to support soil and pest management."),
      concept("irrigation","controlled application of water to support crop production","schedule water according to crop and soil needs","apply unlimited water regardless of drainage or crop demand","Good irrigation matches water supply to plant need while limiting losses."),
      concept("integrated pest management","combining compatible biological, cultural, physical and chemical methods to keep pests below damaging levels","monitor pests and use targeted controls when thresholds justify action","spray the maximum pesticide rate on a fixed schedule without monitoring","IPM combines prevention, monitoring and multiple control strategies."),
      concept("feed conversion","relationship between feed input and animal production output","compare feed used with weight gain or other production","judge feed efficiency only by total feed offered","Feed conversion measures how effectively feed becomes useful animal output."),
      concept("biosecurity","measures preventing introduction and spread of disease within agricultural systems","control movement, hygiene and quarantine where appropriate","move sick and healthy animals together without controls","Biosecurity reduces disease transmission risk."),
      concept("post-harvest loss","loss of quantity or quality after harvest before consumption or processing","improve drying, storage and handling","treat crop damage before harvest as the only form of post-harvest loss","Post-harvest management protects value after produce is harvested."),
      concept("farm budget","a financial plan estimating expected farm income and costs","compare enterprise revenue with variable and fixed costs","ignore costs when evaluating farm profitability","Farm budgeting supports production and investment decisions with expected financial consequences."),
    ],
  },
  {
    id: "hospitality",
    mission: "Design quality service experiences",
    contexts: ["a hotel","a restaurant","a tourism destination","an event venue","a travel service","a resort","a food-service operation","a guest-relations team"],
    concepts: [
      concept("guest cycle","stages of the guest relationship before arrival, during stay and after departure","coordinate reservation, arrival, stay, departure and follow-up","treat checkout as the only guest-service stage","Guest experience spans multiple connected stages."),
      concept("occupancy rate","proportion of available rooms occupied over a period","divide rooms sold by rooms available","divide total revenue by rooms sold and call that occupancy","Occupancy measures utilisation of available room inventory."),
      concept("food safety","practices preventing foodborne illness and contamination","control temperature, hygiene and cross-contamination","leave high-risk food for long periods in unsafe temperature ranges","Food safety depends on time-temperature control, hygiene and contamination prevention."),
      concept("service quality","how well delivered service meets relevant standards and guest expectations","measure reliability, responsiveness and guest feedback","assume appearance alone determines total service quality","Service quality is multidimensional and includes both process and outcome."),
      concept("revenue management","using demand and capacity information to optimise pricing and inventory decisions","adjust room availability and price based on forecast demand","charge one fixed price regardless of demand, capacity or segment and call it revenue management","Revenue management coordinates pricing and capacity under perishable inventory constraints."),
      concept("itinerary","an organised plan of travel activities, timings and locations","sequence attractions with realistic travel time","list places without considering order, time or transport","A usable itinerary coordinates activities with time and logistics."),
      concept("destination management","coordinating tourism resources, stakeholders and visitor impacts in a place","balance visitor experience, community benefits and sustainability","maximise visitor numbers without considering capacity or community impact","Destination management considers economic, social and environmental outcomes."),
      concept("event plan","a coordinated plan for objectives, schedule, resources, risk and guest experience","prepare timeline, responsibilities and contingency measures","book a venue and ignore all other operational requirements","Event planning integrates purpose, logistics, resources, safety and evaluation."),
    ],
  },
  {
    id: "arts",
    mission: "Create and interpret artistic work",
    contexts: ["a design studio","an art classroom","a theatre rehearsal","a music performance","a textile project","a sculpture workshop","a visual composition","a creative production"],
    concepts: [
      concept("balance","distribution of visual or expressive weight within a composition","arrange elements so the work feels intentionally stable or dynamic","place every element randomly and assume balance is automatic","Balance can be symmetrical, asymmetrical or radial and concerns perceived weight."),
      concept("contrast","difference between elements used to create emphasis or clarity","use differences in value, colour, size, texture or sound to create distinction","make every element identical when strong contrast is required","Contrast makes differences perceptible and can create emphasis."),
      concept("rhythm","repetition or patterned variation that creates movement through a work","repeat and vary motifs or beats","use unrelated elements with no pattern and call it rhythmic repetition","Rhythm organises repetition and variation over space or time."),
      concept("texture","surface quality, actual or implied","use mark-making to suggest roughness in a drawing","treat texture as identical to geometric shape","Texture describes how a surface feels or appears to feel."),
      concept("perspective","methods for representing spatial depth on a flat surface","use converging lines and scale changes to suggest depth","draw every object at the same apparent size regardless of distance","Perspective uses visual cues to represent three-dimensional space."),
      concept("motif","a recurring element or idea that contributes to unity and meaning","repeat a visual, musical or dramatic element across a work","use a one-time accidental mark and automatically call it a recurring motif","Motifs gain significance through deliberate recurrence."),
      concept("composition","the organisation of elements within a work","place focal and supporting elements to guide attention","assume composition concerns only the price of materials","Composition concerns how parts are arranged into a whole."),
      concept("performance interpretation","choices that shape how a score, script or movement is realised","use phrasing, timing, dynamics or gesture to communicate meaning","reproduce symbols mechanically without considering expressive context","Interpretation turns notation or text into meaningful performance choices."),
    ],
  },
  {
    id: "environment",
    mission: "Analyse places and environmental systems",
    contexts: ["a watershed","a city","a farming community","a coastal area","a climate station","a land-use plan","a map study","a conservation project"],
    concepts: [
      concept("ecosystem","living organisms interacting with each other and the physical environment","analyse energy and material flows in a defined environment","ignore all non-living factors and call the result the complete ecosystem","Ecosystems include biotic and abiotic interactions."),
      concept("watershed","land area draining water toward a common outlet","trace runoff toward the same river or lake outlet","define a watershed only as the river channel itself","A watershed includes the land contributing runoff to a shared outlet."),
      concept("erosion","removal and transport of soil or rock by agents such as water, wind or ice","reduce exposed-soil runoff using suitable conservation practices","call the breakdown of rock in place alone erosion","Erosion involves transport; weathering breaks material down in place."),
      concept("climate","long-term statistical patterns of weather conditions","compare multi-year temperature and rainfall patterns","use one afternoon's weather to define the climate","Climate describes longer-term distributions and patterns, not one weather event."),
      concept("sustainability","meeting present needs while maintaining ecological, social and economic capacity over time","compare current benefits with long-term resource and community effects","maximise immediate extraction without considering future capacity","Sustainability evaluates long-term resilience and trade-offs."),
      concept("map scale","relationship between distance on a map and actual ground distance","convert map centimetres to real kilometres using the stated scale","change scale differently for each feature on the same map","Map scale provides a consistent distance relationship."),
      concept("population density","population divided by land area","compare people per square kilometre across areas","compare population totals alone and call that density","Density relates population to the area occupied."),
      concept("resource management","planned use and protection of natural or human resources","set use rules based on availability, regeneration and competing needs","treat a finite resource as unlimited","Resource management balances use, conservation and future availability."),
    ],
  },
  {
    id: "general",
    mission: "Build academic reasoning",
    contexts: ["a class lesson","a project","a practical exercise","a case study","an assignment","a group discussion","a field activity","a revision session"],
    concepts: [
      concept("classification","grouping items according to shared criteria","state the rule used and place items consistently into categories","change the grouping rule for each item without explanation","Classification depends on explicit and consistent criteria."),
      concept("comparison","examining similarities and differences using relevant criteria","compare two examples on the same dimensions","describe only one example and call it a comparison","A valid comparison considers both cases using shared criteria."),
      concept("cause and effect","a relationship where one factor contributes to an outcome","separate evidence for causation from simple coincidence","assume events occurring together automatically prove causation","Causal claims need evidence beyond mere co-occurrence."),
      concept("evidence","information used to support or challenge a claim","connect a conclusion to relevant observations or sources","make a strong claim while ignoring all available information","Evidence provides a basis for justified conclusions."),
      concept("process","an ordered set of stages that produces an outcome","identify inputs, steps and outputs","treat an unordered list as an exact procedure","Processes involve connected stages and sequence."),
      concept("system","interacting components forming a meaningful whole","examine components and the relationships between them","study isolated parts while ignoring all interactions and call it full system analysis","Systems thinking considers components, relationships, boundaries and flows."),
      concept("measurement","assigning values using defined rules, units or instruments","choose an appropriate unit and calibrated method","record numbers without units or a defined procedure","Measurement needs a clear quantity, method and unit or scale."),
      concept("evaluation","judging quality or effectiveness against explicit criteria and evidence","state criteria before weighing strengths, weaknesses and evidence","give an unsupported opinion and call it evaluation","Evaluation combines criteria, evidence and reasoned judgement."),
    ],
  },
];

function normalize(value: string) {
  return value.toLowerCase().replaceAll("&", " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function profileFor(subject: string, topic: string): Profile {
  const text = normalize(subject + " " + topic);
  const pick = (id: string) => PROFILES.find((profile) => profile.id === id)!;

  if (/statistics|probability|regression|sampling|data handling|data interpretation|biostatistics|econometrics/.test(text)) return pick("statistics");
  if (/algebra|equation|function|calculus|linear|mathematics for|business mathematics|financial mathematics/.test(text)) return pick("algebra");
  if (/geometry|measurement|drawing|scale|survey|shape|angle/.test(text)) return pick("geometry");
  if (/number|numeracy|ratio|percentage|fraction|arithmetic/.test(text)) return pick("number");
  if (/network|internet|cyber|security|cloud|protocol|data communication/.test(text)) return pick("networks");
  if (/program|software|web|mobile|algorithm|computer|digital|database|information technology|artificial intelligence|machine learning/.test(text)) return pick("computing");
  if (/law|contract|constitutional|criminal|tort|jurisprudence|legal|evidence|procedure|intellectual property/.test(text)) return pick("law");
  if (/account|audit|tax|financial reporting|double entry/.test(text)) return pick("accounting");
  if (/finance|investment|bank|portfolio|derivative|risk management|money|financial economics/.test(text)) return pick("finance");
  if (/economics|microeconom|macroeconom|market|development economics|economic history|labour economics/.test(text)) return pick("economics");
  if (/management|marketing|human resource|entrepreneur|leadership|strategy|procurement|supply|logistics|inventory|operations|business/.test(text)) return pick("business");
  if (/research|method|sampling|project|capstone|thesis|evaluation/.test(text)) return pick("research");
  if (/chemistry|chemical|mole|acid|base|organic|pharmaceutical chemistry/.test(text)) return pick("chemistry");
  if (/medicine|nursing|clinical|health|pharmacy|pharmac|therapeut|pathology|surgery|paediatric|obstetric|psychiatry|anatomy|physiology/.test(text)) return pick("health");
  if (/biology|cell|genetic|microbiology|immunology|biochem|ecology|living|plant|animal/.test(text)) return pick("biology");
  if (/engineering|mechanic|thermodynamic|fluid|structure|material|electric|electronic|circuit|signal|control|machine|construction|manufactur|robotic|aviation|architecture/.test(text)) return pick("engineering");
  if (/geograph|environment|climate|earth|water resource|urban|population|sustainab/.test(text)) return pick("environment");
  if (/psycholog|cognitive|behaviour|counsell|personality|mental/.test(text)) return pick("psychology");
  if (/education|teaching|curriculum|assessment|pedagogy|classroom|learning/.test(text)) return pick("education");
  if (/agricultur|crop|soil|farm|fisher|forestry|horticulture|animal husbandry|agribusiness/.test(text)) return pick("agriculture");
  if (/hospitality|tourism|hotel|food production|food and beverage|event|destination|front office/.test(text)) return pick("hospitality");
  if (/art|design|music|drama|dance|sculpt|textile|ceramic|leather|basketry|picture|visual|performance/.test(text)) return pick("arts");
  if (/english|language|literature|french|arabic|writing|reading|speaking|listening|communication|grammar|vocabulary/.test(text)) return pick("language");
  if (/social|governance|citizen|politic|sociolog|history|government|international relation|public policy|culture|development|religious|moral/.test(text)) return pick("social");
  return pick("general");
}

function product(values: readonly number[]) {
  return values.reduce((total, value) => total * value, 1);
}

const DIMENSION_BASE = [ACTORS.length, MOMENTS.length, STEMS.length, 8, 4, 32] as const;

function profileCapacity(profile: Profile) {
  return product([profile.concepts.length, profile.contexts.length, ...DIMENSION_BASE]);
}

export const MINIMUM_TOPIC_GENERATED_CAPACITY = Math.min(...PROFILES.map(profileCapacity));

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function mixedIndex(key: string, capacity: number) {
  const high = hash(key + ":high");
  const low = hash(key + ":low") & 0x1fffff;
  return (high * 0x200000 + low) % capacity;
}

function decode(index: number, dimensions: readonly number[]) {
  let value = Math.max(0, Math.floor(index));
  return dimensions.map((dimension) => {
    const digit = value % dimension;
    value = Math.floor(value / dimension);
    return digit;
  });
}

function clampDifficulty(value: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.round(value))) as 1 | 2 | 3 | 4 | 5;
}

function levelDifficulty(levelId: string) {
  if (/kg-|basic-[12]/.test(levelId)) return 1;
  if (/basic-|jhs-1/.test(levelId)) return 2;
  if (/jhs-[23]|shs-1|level-100/.test(levelId)) return 2;
  if (/shs-2|level-200/.test(levelId)) return 3;
  if (/shs-3|level-300/.test(levelId)) return 4;
  if (/level-[456]00/.test(levelId)) return 5;
  return 3;
}

function targetsFor(config: SessionConfig): Target[] {
  const catalog = catalogFor(config.lane);
  const program = catalog.programs.find((item) => item.id === config.programId);
  const level = program?.levels.find((item) => item.id === config.levelId);
  if (!level) return [];

  const subjects = config.subjectId === "all"
    ? level.subjects
    : level.subjects.filter((subject) => subject.id === config.subjectId);

  return subjects.flatMap((subject) => {
    const topics = config.topicId === "all"
      ? subject.topics
      : subject.topics.filter((topic) => topic.id === config.topicId);
    return topics.map((topic) => ({
      subjectId: subject.id,
      subjectLabel: subject.contentLabel ?? subject.label,
      topicId: topic.id,
      topicLabel: topic.label,
    }));
  });
}

function rotate<T>(values: readonly T[], offset: number) {
  if (!values.length) return [] as T[];
  const index = ((offset % values.length) + values.length) % values.length;
  return [...values.slice(index), ...values.slice(0, index)];
}

function singleChoice(answer: string, distractors: string[], variant: number) {
  const unique = Array.from(new Set([answer, ...distractors])).slice(0, 4);
  const rotated = rotate(unique, variant);
  return {
    options: rotated.map((label, index) => ({ id: String(index), label })),
    answer: String(rotated.indexOf(answer)),
  };
}

function renderQuestion(target: Target, profile: Profile, variant: number, config: SessionConfig): LearnQuestion {
  const dimensions = [profile.concepts.length, profile.contexts.length, ...DIMENSION_BASE] as const;
  const [conceptIndex, contextIndex, actorIndex, momentIndex, stemIndex, angleIndex, formIndex, caseIndex] = decode(variant, dimensions);
  const item = profile.concepts[conceptIndex];
  const others = rotate(profile.concepts.filter((concept) => concept.term !== item.term), caseIndex);
  const actor = ACTORS[actorIndex];
  const context = profile.contexts[contextIndex];
  const moment = MOMENTS[momentIndex];
  const stem = STEMS[stemIndex];
  const challenge: CognitiveChallenge = angleIndex < 2 ? "Recall" : angleIndex < 4 ? "Apply" : angleIndex < 6 ? "Analyse" : "Transfer";
  const base = {
    id: `coverage-${profile.id}-${target.subjectId}-${target.topicId}-${variant}`,
    exposureKey: `coverage:${config.lane}:${config.programId}:${config.levelId}:${target.subjectId}:${target.topicId}:${variant}`,
    subject: target.subjectLabel,
    topic: target.topicLabel,
    difficulty: clampDifficulty(levelDifficulty(config.levelId) + (challenge === "Analyse" ? 1 : challenge === "Transfer" ? 1 : 0)),
    challenge,
    mission: profile.mission,
    generationFamily: `coverage-${profile.id}-${target.topicId}`,
  } as const;

  if (formIndex === 0) {
    const choice = singleChoice(item.term, others.slice(0, 3).map((entry) => entry.term), variant);
    return {
      ...base,
      kind: "single",
      skill: `Recognise ${item.term}`,
      prompt: `${actor} is studying ${target.topicLabel} in ${target.subjectLabel} ${moment} at ${context}. The key idea is: ${item.definition}. ${stem}`,
      options: choice.options,
      answer: choice.answer,
      explanation: item.explanation,
      hint: `Look for the concept whose definition matches the description in the question.`,
    };
  }

  if (formIndex === 1) {
    const choice = singleChoice(item.application, others.slice(0, 3).map((entry) => entry.application), variant);
    return {
      ...base,
      kind: "single",
      skill: `Apply ${item.term}`,
      prompt: `${actor} is working on ${target.topicLabel} ${moment} at ${context}. Which action is the best application of ${item.term}? ${stem}`,
      options: choice.options,
      answer: choice.answer,
      explanation: `${item.application}. ${item.explanation}`,
      hint: `Choose the action that directly uses the principle named in the question.`,
    };
  }

  if (formIndex === 2) {
    const trueStatement = caseIndex % 2 === 0;
    const statement = trueStatement ? item.definition : item.misconception;
    return {
      ...base,
      kind: "boolean",
      skill: `Evaluate a statement about ${item.term}`,
      prompt: `${actor} makes this statement while studying ${target.topicLabel} ${moment}: “${item.term} means ${statement}.” Is the statement correct?`,
      answer: trueStatement,
      explanation: trueStatement ? item.explanation : `The statement is not correct. ${item.explanation}`,
      hint: `Compare the statement with the accepted meaning of ${item.term}.`,
    };
  }

  const choice = singleChoice(item.misconception, others.slice(0, 3).map((entry) => entry.misconception), variant);
  return {
    ...base,
    kind: "single",
    skill: `Detect a misconception about ${item.term}`,
    prompt: `${actor} is reviewing ${target.topicLabel} ${moment} at ${context}. Which option shows the specific misconception about ${item.term} that should be corrected? ${stem}`,
    options: choice.options,
    answer: choice.answer,
    explanation: `${item.misconception} is the misconception. ${item.explanation}`,
    hint: `Identify the claim that conflicts with the accepted meaning of ${item.term}.`,
  };
}

export function coverageCapacityForSelection(config: SessionConfig) {
  return targetsFor(config).reduce((total, target) => {
    return total + profileCapacity(profileFor(target.subjectLabel, target.topicLabel));
  }, 0);
}

export function coverageCapacityPerTarget(config: SessionConfig) {
  return targetsFor(config).map((target) => ({
    ...target,
    profile: profileFor(target.subjectLabel, target.topicLabel).id,
    capacity: profileCapacity(profileFor(target.subjectLabel, target.topicLabel)),
  }));
}

export function buildCoverageQuestions(
  config: SessionConfig,
  requestedCount = config.count,
  seed = config.seed ?? Date.now(),
): LearnQuestion[] {
  const requested = Math.max(0, Math.min(500, Math.floor(requestedCount)));
  if (!requested) return [];

  const targets = targetsFor(config);
  if (!targets.length) return [];

  const output: LearnQuestion[] = [];
  const seen = new Set<string>();

  for (let position = 0; output.length < requested && position < requested * 6; position += 1) {
    const target = targets[(hash(`${seed}:target:${position}`) + position) % targets.length];
    const profile = profileFor(target.subjectLabel, target.topicLabel);
    const capacity = profileCapacity(profile);
    const variant = mixedIndex(`${config.lane}:${config.programId}:${config.levelId}:${target.subjectId}:${target.topicId}:${seed}:${position}`, capacity);
    const question = renderQuestion(target, profile, variant, config);
    if (seen.has(question.exposureKey)) continue;
    seen.add(question.exposureKey);
    output.push(question);
  }

  return output;
}
