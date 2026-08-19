"""
Phase V2: Real Student Assessment Execution & Submission Validation Engine.
Executes the genuine student assessment workflow through FastAPI TestClient/API endpoints
using the 10 synthetic students and 3 genuine A/L papers.
"""
import sys
import json
import time
from datetime import datetime
from typing import Dict, Any, List

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import func

from main import app
from app.database import SessionLocal
from app.models import (
    User, UserRole, Course, ALExam, ALQuestion, ALStudentSubmission, ALStudentAnswer,
    ALExamType
)

client = TestClient(app)

# Load Question and Paper Metadata
with open("scratch_v2_env_data.json", "r", encoding="utf-8") as f:
    PAPER_DATA = json.load(f)

# Correct Answer Keys for Paper 1 MCQ (50 questions)
MCQ_QUESTIONS = PAPER_DATA["paper_1_mcq"]["questions"]
CORRECT_MCQ_KEYS = {q["number"]: q["correct_option"] for q in MCQ_QUESTIONS}
MCQ_ID_BY_NUM = {q["number"]: q["id"] for q in MCQ_QUESTIONS}

# Structured Questions for Paper 2A (4 questions)
STRUCT_QUESTIONS = PAPER_DATA["paper_2a_structured"]["questions"]
STRUCT_ID_BY_NUM = {q["number"]: q["id"] for q in STRUCT_QUESTIONS}

# Essay Questions for Paper 2B (3 questions)
ESSAY_QUESTIONS = PAPER_DATA["paper_2b_essay"]["questions"]
ESSAY_IDS = [q["id"] for q in ESSAY_QUESTIONS] # [3004, 3005, 3006]

# Distractor Cycle Helper
ALL_OPTIONS = ["A", "B", "C", "D", "E"]

def get_distractor(correct_opt: str, offset: int = 1) -> str:
    opts = [o for o in ALL_OPTIONS if o != correct_opt]
    return opts[(offset - 1) % len(opts)]

# ─────────────────────────────────────────────────────────────────────────────
# 1. CONTROLLED MCQ PROFILES FOR THE 10 STUDENTS
# ─────────────────────────────────────────────────────────────────────────────

def build_student_mcq_answers(student_num: int) -> List[Dict[str, Any]]:
    """
    Generates realistic, varied MCQ answer choices for student 1 to 10
    satisfying target scores, distractor variation, and intentional blanks.
    """
    answers = []

    # Number of correct answers per student:
    # S1: 46/50 (92%), S2: 43/50 (86%), S3: 41/50 (82%), S4: 36/50 (72%), S5: 33/50 (66%)
    # S6: 28/50 (56%), S7: 25/50 (50%, 1 blank), S8: 22/50 (44%, 2 blanks), S9: 18/50 (36%, 3 blanks), S10: 14/50 (28%, 5 blanks)
    
    # Define which question numbers each student answers incorrectly or leaves blank:
    incorrect_map = {
        1: [14, 28, 39, 48], # 4 wrong -> 46/50
        2: [5, 12, 23, 34, 42, 49, 50], # 7 wrong -> 43/50
        3: [3, 8, 17, 24, 31, 38, 44, 47, 50], # 9 wrong -> 41/50
        4: [2, 6, 9, 15, 18, 22, 27, 32, 35, 40, 43, 45, 48, 50], # 14 wrong -> 36/50
        5: [1, 4, 7, 11, 14, 19, 21, 25, 29, 33, 36, 39, 41, 44, 46, 48, 50], # 17 wrong -> 33/50
        6: [2, 4, 5, 8, 10, 13, 16, 18, 20, 23, 26, 28, 30, 32, 35, 37, 40, 42, 44, 46, 48, 50], # 22 wrong -> 28/50
        7: [1, 3, 6, 8, 11, 13, 15, 17, 20, 22, 24, 27, 29, 31, 34, 36, 38, 41, 43, 45, 47, 48, 49, 50], # 24 wrong + 1 blank (#25) -> 25/50
        8: [2, 3, 5, 7, 9, 12, 14, 16, 18, 21, 23, 25, 28, 30, 32, 35, 37, 39, 42, 44, 46, 47, 49, 50], # 26 wrong + 2 blanks (#10, #40) -> 22/50
        9: [1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 24, 26, 27, 30, 31, 33, 34, 36, 37, 39, 42, 43, 45, 48], # 29 wrong + 3 blanks (#5, #20, #50) -> 18/50
        10: [1, 2, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17, 19, 20, 22, 23, 25, 26, 28, 29, 31, 32, 34, 35, 37, 38, 40, 41, 43, 44, 46], # 31 wrong + 5 blanks (#6, #15, #27, #45, #50) -> 14/50
    }

    blank_map = {
        7: [25],
        8: [10, 40],
        9: [5, 20, 50],
        10: [6, 15, 27, 45, 50]
    }

    wrong_set = set(incorrect_map.get(student_num, []))
    blank_set = set(blank_map.get(student_num, []))

    for q in MCQ_QUESTIONS:
        q_num = q["number"]
        q_id = q["id"]
        correct = q["correct_option"]

        if q_num in blank_set:
            # Intentionally unanswered item
            continue
        elif q_num in wrong_set:
            # Pick a varying distractor based on student number and question number
            chosen = get_distractor(correct, offset=student_num + q_num)
        else:
            chosen = correct

        answers.append({
            "question_id": q_id,
            "selected_option": chosen
        })

    return answers

# ─────────────────────────────────────────────────────────────────────────────
# 2. CONTROLLED STRUCTURED ANSWERS FOR THE 10 STUDENTS
# ─────────────────────────────────────────────────────────────────────────────

def build_student_structured_answers(student_num: int) -> List[Dict[str, Any]]:
    """
    Generates realistic, scientifically accurate multi-part structured answers
    reflecting each student's performance tier across Questions 1, 2, 3, and 4.
    """
    answers = []

    # High Performers (S1, S2, S3)
    # Medium Performers (S4, S5, S6)
    # Inconsistent Performers (S7, S8)
    # Weak Performers (S9, S10)

    # ── QUESTION 1 (Nephron & Osmoregulation, ID 3000) ──
    if student_num == 1:
        q1_subparts = {
            "node_1786909059508_o4p02n": {
                "Glomerulus": "Ultrafiltration of blood plasma under high hydrostatic pressure into Bowman's capsule.",
                "Proximal Convoluted Tubule": "Obligatory reabsorption of 100% glucose, amino acids, and ~70% of water and sodium ions.",
                "Loop of Henle": "Generation of hypertonic osmotic gradient in the medullary interstitium via counter-current multiplication.",
                "Distal Convoluted Tubule": "Facultative reabsorption of water under ADH and sodium reabsorption stimulated by aldosterone."
            },
            "node_1786909059508_m2k1sp": [
                "Descending limb is water-permeable leading to passive water efflux into hypertonic interstitium.",
                "Filtrate reaches maximum concentration at hairpin bend.",
                "Thick ascending limb actively transports Na+ and Cl- out into medullary interstitium while impermeable to water.",
                "Continuous opposing flow establishes a multiplying vertical osmotic gradient from cortex (300 mOsm) to inner medulla (1200 mOsm)."
            ],
            "node_1786909059508_5b3q1z": "When blood osmolarity increases, hypothalamic osmoreceptors trigger posterior pituitary to secrete ADH. ADH binds V2 receptors on collecting duct principal cells, causing aquaporin-2 vesicle exocytosis into the apical membrane. Water reabsorption increases, producing concentrated hypertonic urine and restoring plasma osmolarity.",
            "node_1786909059508_073q6c": "In chronic kidney disease of unknown etiology (CKDu), tubulointerstitial damage reduces the medullary osmotic gradient. Inulin or creatinine clearance tests measure GFR: Clearance = (U_cr * V) / P_cr. Progressive drop below 60 mL/min/1.73m² indicates renal failure requiring hemodialysis or transplantation."
        }
    elif student_num in [2, 3]:
        q1_subparts = {
            "node_1786909059508_o4p02n": {
                "Glomerulus": "Filtration of blood fluid into Bowman's space.",
                "Proximal Convoluted Tubule": "Reabsorption of all glucose, amino acids, and most water/salts.",
                "Loop of Henle": "Creates high salt concentration in kidney medulla.",
                "Distal Convoluted Tubule": "Selective water and ion reabsorption."
            },
            "node_1786909059508_m2k1sp": [
                "Descending limb allows water out by osmosis.",
                "Fluid becomes concentrated at the bottom.",
                "Ascending limb actively pumps sodium and chloride out.",
                "Counter-current flow multiplies the medullary gradient."
            ],
            "node_1786909059508_5b3q1z": "ADH is released from the pituitary gland when dehydrated. It increases water permeability of collecting ducts by inserting aquaporin channels, making urine concentrated.",
            "node_1786909059508_073q6c": "CKDu causes damage to kidney tubules in agricultural areas. Renal clearance calculation: GFR = (U * V) / P. Decreased clearance means kidney cannot filter nitrogenous wastes effectively."
        }
    elif student_num in [4, 5, 6]:
        q1_subparts = {
            "node_1786909059508_o4p02n": {
                "Glomerulus": "Filtration of blood.",
                "Proximal Convoluted Tubule": "Reabsorption of useful substances like glucose.",
                "Loop of Henle": "Water and salt balance in medulla.",
                "Distal Convoluted Tubule": "Hormone controlled reabsorption."
            },
            "node_1786909059508_m2k1sp": [
                "Water moves out in descending limb.",
                "Concentrated filtrate at tip.",
                "Salt is pumped out in ascending limb.",
                "Creates high concentration in kidney."
            ],
            "node_1786909059508_5b3q1z": "ADH increases water absorption in the collecting duct when body water is low.",
            "node_1786909059508_073q6c": "CKDu damages renal tubules leading to reduced waste excretion and low GFR."
        }
    elif student_num in [7, 8]:
        # S7 is good at physiology, S8 is average
        q1_subparts = {
            "node_1786909059508_o4p02n": {
                "Glomerulus": "Ultrafiltration under pressure.",
                "Proximal Convoluted Tubule": "Reabsorption of glucose and salts.",
                "Loop of Henle": "Osmotic gradient creation.",
                "Distal Convoluted Tubule": "Tubular secretion and reabsorption."
            },
            "node_1786909059508_m2k1sp": [
                "Water leaves descending limb.",
                "NaCl leaves ascending limb.",
                "Gradient maintained by opposing flow."
            ],
            "node_1786909059508_5b3q1z": "ADH causes collecting duct cells to absorb more water so urine volume decreases.",
            "node_1786909059508_073q6c": "Kidney clearance formula helps calculate filtering rate. In CKDu it drops significantly."
        }
    else:
        # S9, S10 (Weak / At-risk)
        q1_subparts = {
            "node_1786909059508_o4p02n": {
                "Glomerulus": "Filters blood.",
                "Proximal Convoluted Tubule": "Takes back food.",
                "Loop of Henle": "U-shaped tube for salt.",
                "Distal Convoluted Tubule": "Urine passage."
            },
            "node_1786909059508_m2k1sp": [
                "Water and salt move in loop of Henle."
            ],
            "node_1786909059508_5b3q1z": "ADH controls urine concentration in kidney.",
            "node_1786909059508_073q6c": "CKDu is kidney disease common in Sri Lanka dry zone."
        }
    answers.append({"question_id": STRUCT_ID_BY_NUM[1], "subpart_answers_json": q1_subparts})

    # ── QUESTION 2 (Mammalian Kidney & Nitrogenous Excretion, ID 3001) ──
    if student_num in [1, 2, 3]:
        q2_subparts = {
            "node_1786909059508_r8a48b": {
                "Renal Cortex": "Contains renal corpuscles (Bowman's capsules, glomeruli), proximal and distal convoluted tubules.",
                "Renal Medulla": "Contains loops of Henle, collecting ducts, and vasa recta organized into renal pyramids."
            },
            "node_1786909059508_q8j546": "Ultrafiltration occurs across the three-layered filtration barrier: fenestrated capillary endothelium, negatively charged basement membrane, and podocyte filtration slits with slit diaphragms, preventing passage of plasma proteins and blood cells.",
            "node_1786909059508_s6b27d": "Net Filtration Pressure (NFP) = Glomerular Blood Hydrostatic Pressure (60 mmHg) - [Capsular Hydrostatic Pressure (18 mmHg) + Blood Colloid Osmotic Pressure (32 mmHg)] = +10 mmHg. Normal GFR is approximately 125 mL/min.",
            "node_1786909059508_w2e17l": "Macula densa cells sense low Na+/Cl- in DCT and signal juxtaglomerular cells to secrete renin. Renin converts angiotensinogen to angiotensin I, which ACE converts to angiotensin II, causing systemic vasoconstriction and aldosterone release to restore blood pressure and GFR."
        }
    elif student_num in [4, 5, 6, 7]:
        q2_subparts = {
            "node_1786909059508_r8a48b": {
                "Renal Cortex": "Outer region with glomeruli and convoluted tubules.",
                "Renal Medulla": "Inner region with loops of Henle and collecting tubules."
            },
            "node_1786909059508_q8j546": "Filtration barrier consists of capillary pores, basement membrane, and podocyte slit pores, allowing small molecules to pass while blocking large proteins.",
            "node_1786909059508_s6b27d": "Filtration pressure is roughly 10 mmHg driving fluid into Bowman's capsule, yielding about 180 liters of filtrate daily.",
            "node_1786909059508_w2e17l": "When blood pressure drops, the juxtaglomerular apparatus releases renin, stimulating angiotensin II and aldosterone to raise pressure."
        }
    else:
        q2_subparts = {
            "node_1786909059508_r8a48b": {
                "Renal Cortex": "Outer dark part.",
                "Renal Medulla": "Inner pyramid part."
            },
            "node_1786909059508_q8j546": "Podocytes and capillaries filter waste into kidney.",
            "node_1786909059508_s6b27d": "Pressure forces water and urea into nephron.",
            "node_1786909059508_w2e17l": "Renin hormone increases blood pressure."
        }
    answers.append({"question_id": STRUCT_ID_BY_NUM[2], "subpart_answers_json": q2_subparts})

    # ── QUESTION 3 (Photosynthesis & C4 Adaptations, ID 3002) ──
    if student_num in [1, 2, 3]:
        q3_subparts = {
            "node_1786909059509_v8q7m1": {
                "Light Reactions": "Occurs on thylakoid membranes; produces ATP, NADPH, and O2 using light energy and water photolysis.",
                "Calvin Cycle": "Occurs in stroma; fixes CO2 using RuBisCO, consuming ATP and NADPH to synthesize glyceraldehyde-3-phosphate (G3P)."
            },
            "node_1786909059509_g8v32k": "RuBisCO exhibits both carboxylase and oxygenase activities. In hot dry conditions, high O2/CO2 ratio promotes oxygenation of RuBP to 3-PGA and 2-phosphoglycolate, leading to photorespiration which wastes up to 25-50% of fixed carbon without ATP production.",
            "node_1786909059509_d9l88z": [
                "CO2 is fixed by PEP carboxylase in mesophyll cells to form 4-carbon oxaloacetate.",
                "Oxaloacetate is reduced to malate and transported into bundle sheath cells via plasmodesmata.",
                "Malate is decarboxylated in bundle sheath cells, concentrating CO2 around RuBisCO to suppress photorespiration."
            ],
            "node_1786909059509_p7x91k": "Crassulacean Acid Metabolism (CAM) plants open stomata at night to fix CO2 into malic acid stored in vacuoles, and close stomata during the day to decarboxylate malate and run the Calvin cycle, minimizing transpiration in arid environments."
        }
    elif student_num in [4, 5, 6, 8]:
        q3_subparts = {
            "node_1786909059509_v8q7m1": {
                "Light Reactions": "Thylakoid reactions generating ATP and NADPH.",
                "Calvin Cycle": "Stroma reactions fixing carbon into sugar."
            },
            "node_1786909059509_g8v32k": "RuBisCO binds oxygen instead of CO2 when stomata close, causing photorespiration and reducing photosynthetic efficiency.",
            "node_1786909059509_d9l88z": [
                "PEP carboxylase fixes carbon in mesophyll.",
                "Malate moves to bundle sheath cells.",
                "CO2 is released for Calvin cycle."
            ],
            "node_1786909059509_p7x91k": "CAM plants fix CO2 at night to save water and use it during the day."
        }
    else:
        q3_subparts = {
            "node_1786909059509_v8q7m1": {
                "Light Reactions": "Sunlight makes energy in chloroplast.",
                "Calvin Cycle": "Dark reaction makes glucose."
            },
            "node_1786909059509_g8v32k": "Photorespiration is wasteful process in C3 plants.",
            "node_1786909059509_d9l88z": [
                "C4 plants have Kranz anatomy to reduce photorespiration."
            ],
            "node_1786909059509_p7x91k": "Desert plants open pores at night."
        }
    answers.append({"question_id": STRUCT_ID_BY_NUM[3], "subpart_answers_json": q3_subparts})

    # ── QUESTION 4 (Cellular Respiration & Bioenergetics, ID 3003) ──
    if student_num in [1, 2, 3]:
        q4_subparts = {
            "node_1786909059509_lxwix5": {
                "Glycolysis": "Cytosol / Cytoplasm",
                "Krebs Cycle (Citric Acid Cycle)": "Mitochondrial matrix"
            },
            "node_1786909059509_icgkqm": "Oxygen acts as terminal electron acceptor in Complex IV, combining with electrons and protons to form metabolic water. Without oxygen, electron flow stops, proton pumping ceases, and oxidative phosphorylation halts, forcing reliance on anaerobic fermentation.",
            "node_1786909059509_b1y98a": "In lactate fermentation, pyruvate is reduced by NADH to lactate via lactate dehydrogenase, regenerating NAD+ for glycolysis. In alcoholic fermentation, pyruvate is decarboxylated to acetaldehyde and reduced to ethanol releasing CO2.",
            "node_1786909059509_k4n72f": "Theoretical ATP yield per glucose: Glycolysis (2 net ATP + 2 NADH -> ~5-7 ATP), Link reaction (2 NADH -> ~5 ATP), Krebs cycle (2 ATP/GTP + 6 NADH + 2 FADH2 -> ~20 ATP). Total: 30 to 32 ATP."
        }
    elif student_num in [4, 5, 6, 7]:
        q4_subparts = {
            "node_1786909059509_lxwix5": {
                "Glycolysis": "Cytoplasm",
                "Krebs Cycle (Citric Acid Cycle)": "Mitochondrial matrix"
            },
            "node_1786909059509_icgkqm": "Oxygen takes the final electrons in the ETC and makes water. If absent, ETC stops and cells must do anaerobic respiration.",
            "node_1786909059509_b1y98a": "Lactic acid fermentation occurs in muscles regenerating NAD+, while yeast does alcoholic fermentation producing ethanol and carbon dioxide.",
            "node_1786909059509_k4n72f": "Complete aerobic oxidation produces about 30-32 ATP per glucose molecule."
        }
    else:
        q4_subparts = {
            "node_1786909059509_lxwix5": {
                "Glycolysis": "Cell cytoplasm",
                "Krebs Cycle (Citric Acid Cycle)": "Mitochondria"
            },
            "node_1786909059509_icgkqm": "Oxygen is needed to breathe and make ATP in mitochondria.",
            "node_1786909059509_b1y98a": "Anaerobic respiration makes lactic acid or alcohol.",
            "node_1786909059509_k4n72f": "Produces around 32 ATP."
        }
    answers.append({"question_id": STRUCT_ID_BY_NUM[4], "subpart_answers_json": q4_subparts})

    return answers

# ─────────────────────────────────────────────────────────────────────────────
# 3. CONTROLLED ESSAY RESPONSES FOR THE 10 STUDENTS
# ─────────────────────────────────────────────────────────────────────────────

def build_student_essay_answers(student_num: int) -> List[Dict[str, Any]]:
    """
    Generates realistic, comprehensive biological essays reflecting each
    student's performance tier across Questions 1, 2, and 3.
    """
    answers = []

    # ── ESSAY 1 (Action Potential & Chemical Synapse, ID 3004) ──
    if student_num == 1:
        essay_1_text = """### Generation and Propagation of an Action Potential and Synaptic Transmission

#### 1. Resting Membrane Potential
The resting membrane potential of a mammalian neuron is maintained at approximately -70 mV. This polarized state is actively established by the electrogenic sodium-potassium pump (Na⁺/K⁺ ATPase), which expels 3 Na⁺ ions from the axoplasm for every 2 K⁺ ions pumped inward against their electrochemical gradients using ATP. Furthermore, the neuronal membrane at rest is significantly more permeable to K⁺ than Na⁺ due to non-gated K⁺ leakage channels, leading to a net positive charge on the outer axonal surface and a negative resting internal potential.

#### 2. Depolarization, Repolarization, and Hyperpolarization
When a stimulus depolarizes the axonal membrane above the threshold potential (~ -55 mV), voltage-gated Na⁺ channels open rapidly. Na⁺ rushes into the axoplasm down both concentration and electrical gradients, causing explosive depolarization up to approximately +30 mV. At this peak, voltage-gated Na⁺ channels inactivate and close, while voltage-gated K⁺ channels open. Rapid efflux of K⁺ down its concentration gradient repolarizes the membrane back towards resting potential. Due to delayed closure of voltage-gated K⁺ gates, a brief after-hyperpolarization (undershoot to ~ -80 mV) occurs before resting potential is restored by the Na⁺/K⁺ pump.

#### 3. Saltatory Conduction along Myelinated Axons
In myelinated mammalian neurons, the myelin sheath produced by Schwann cells acts as an electrical insulator with high resistance and low capacitance. Voltage-gated Na⁺ and K⁺ channels are densely concentrated at unmyelinated gaps termed the Nodes of Ranvier. Consequently, local electrical circuits flow intracellularly from one active node to depolarize the adjacent resting node, allowing the action potential to 'jump' rapidly between nodes. This saltatory conduction drastically accelerates nerve impulse velocity (up to 120 m/s) while conserving metabolic ATP.

#### 4. Mechanism of Synaptic Transmission at a Chemical Synapse
When an action potential arrives at the presynaptic axon terminal, it depolarizes the presynaptic membrane, opening voltage-gated Ca²⁺ channels. Extracellular Ca²⁺ rushes into the synaptic knob down its steep concentration gradient. This intracellular Ca²⁺ rise triggers synaptotagmin-mediated vesicular fusion, causing synaptic vesicles containing neurotransmitter (such as acetylcholine) to undergo exocytosis into the 20 nm synaptic cleft.

Neurotransmitter molecules diffuse across the cleft and bind reversibly to ligand-gated ionotropic receptors on the postsynaptic membrane. In an excitatory synapse, receptor binding opens ligand-gated Na⁺ channels, causing Na⁺ influx and generating an Excitatory Postsynaptic Potential (EPSP). If the sum of EPSPs reaches threshold at the axon hillock, a new action potential is fired. In inhibitory synapses, GABA or glycine opening Cl⁻ or K⁺ channels produces hyperpolarizing IPSPs. Finally, the synaptic signal is terminated rapidly by enzymatic hydrolysis (acetylcholinesterase degrading acetylcholine into acetate and choline) and presynaptic reuptake mechanisms."""
    elif student_num in [2, 3]:
        essay_1_text = """### Generation and Propagation of Nerve Impulses and Synaptic Transmission

The resting membrane potential of a neuron is typically -70 mV, maintained by the sodium-potassium pump (pumping 3 Na⁺ out for every 2 K⁺ in using ATP) and leaky potassium channels.

When a stimulus reaches the threshold potential, voltage-gated sodium channels open rapidly, allowing Na⁺ ions to enter the axon. This causes depolarization, reversing the membrane potential to +30 mV. Then sodium channels close and voltage-gated potassium channels open, allowing K⁺ ions to rush out of the cell. This repolarizes the membrane. A temporary hyperpolarization occurs due to slow potassium channel closure before resting potential returns.

In myelinated neurons, Schwann cells form a myelin sheath acting as an electrical insulator. Voltage-gated channels are concentrated at the Nodes of Ranvier. The action potential jumps from one node to the next in saltatory conduction, which greatly increases impulse speed and saves cellular energy.

When the action potential arrives at the synaptic terminal, it opens voltage-gated calcium channels. Ca²⁺ ions enter the terminal, stimulating synaptic vesicles to fuse with the presynaptic membrane and release acetylcholine into the synaptic cleft by exocytosis. Acetylcholine diffuses across the cleft and binds to specific receptors on the postsynaptic membrane, opening sodium channels to create an excitatory postsynaptic potential (EPSP). The signal is stopped by acetylcholinesterase breaking down acetylcholine."""
    elif student_num in [4, 5, 6]:
        essay_1_text = """An action potential is generated when a neuron is stimulated above its threshold. Sodium channels open and sodium ions enter, causing depolarization of the membrane to positive values. Then potassium channels open and potassium leaves, causing repolarization. The sodium-potassium pump maintains the resting potential at -70 mV.

In myelinated axons, myelin sheaths insulate the nerve fiber except at the Nodes of Ranvier. The nerve impulse jumps from node to node, called saltatory conduction, making transmission faster.

At a synapse, when the impulse reaches the end of the axon, calcium ions enter the presynaptic knob. This causes vesicles to release neurotransmitter (like acetylcholine) into the synaptic gap. The chemical binds to receptors on the next neuron, causing sodium to enter and exciting the postsynaptic cell. Enzymes like acetylcholinesterase break down the transmitter to stop continuous firing."""
    else:
        essay_1_text = """Nerve impulses travel along neurons through electrical changes. The resting potential is -70 mV maintained by the Na/K pump. When stimulated, sodium enters the axon making it positive, and then potassium leaves making it negative again.

Myelinated nerves have myelin sheaths with gaps called Nodes of Ranvier. The impulse jumps between nodes which is faster.

At the synapse, the electrical impulse causes chemical transmitters to be released across the gap. The neurotransmitter binds to receptors on the next cell to pass the signal, and is then broken down by enzymes."""
    answers.append({"question_id": ESSAY_IDS[0], "essay_text_answer": essay_1_text})

    # ── ESSAY 2 (Photosynthesis vs Respiration Bioenergetics, ID 3005) ──
    if student_num in [1, 2, 3]:
        essay_2_text = """### Bioenergetics: Photophosphorylation and Mitochondrial Oxidative Phosphorylation

#### 1. Non-Cyclic Photophosphorylation
Non-cyclic photophosphorylation occurs on the thylakoid membranes of chloroplasts and involves both Photosystem II (P680) and Photosystem I (P700) working in series (Z-scheme). Photons absorbed by antenna complexes in PS II excite P680 reaction center electrons, which are transferred to a primary electron acceptor (pheophytin). The electron deficit in P680 is replenished by the photolysis of water at the oxygen-evolving complex:
2 H₂O → 4 H⁺ + 4 e⁻ + O₂.

Electrons flow down an electron transport chain consisting of plastoquinone (PQ), cytochrome b₆f complex, and plastocyanin (PC) to PS I. Cytochrome b₆f pumps protons into the thylakoid lumen, generating a proton motive force. Protons diffuse down their electrochemical gradient into the stroma through ATP synthase, synthesizing ATP via photophosphorylation. Simultaneously, photons absorbed by PS I excite P700 electrons, which travel via ferredoxin to ferredoxin-NADP⁺ reductase (FNR), reducing NADP⁺ to NADPH. Thus, non-cyclic photophosphorylation produces ATP, NADPH, and O₂.

#### 2. Comparison: Cyclic vs Non-Cyclic Photophosphorylation
- **Photosystems involved**: Non-cyclic utilizes both PS II and PS I; cyclic utilizes only PS I.
- **Photolysis of water & oxygen evolution**: Water is split and O₂ is evolved in non-cyclic; neither occurs in cyclic.
- **Terminal electron acceptor**: NADP⁺ receives electrons in non-cyclic; in cyclic, electrons return from ferredoxin back to the cytochrome b₆f complex.
- **End products**: Non-cyclic yields ATP, NADPH, and O₂; cyclic yields only ATP (used to meet the excess ATP demand of the Calvin cycle and C4/CAM pathways).

#### 3. Mitochondrial Electron Transport and Oxidative Phosphorylation
In the inner mitochondrial membrane, high-energy electrons donated by NADH (at Complex I) and FADH₂ (at Complex II) pass sequentially through ubiquinone (CoQ), Complex III (cytochrome bc₁), cytochrome c, and Complex IV (cytochrome c oxidase) to molecular oxygen, the terminal electron acceptor, forming H₂O.
Free energy released during electron transfers drives proton pumping from the matrix across the inner membrane into the intermembrane space at Complexes I, III, and IV. The resulting proton motive force drives protons back into the matrix through the F₀F₁ ATP synthase complex (chemiosmosis), catalyzing the phosphorylation of ADP + Pi to ATP, generating the bulk of cellular energy."""
    elif student_num in [4, 5, 6, 7, 8]:
        essay_2_text = """Photosynthesis and cellular respiration are the central bioenergetic processes in living systems.

In non-cyclic photophosphorylation, light is absorbed by PS II (P680) exciting electrons. Water is split by photolysis into oxygen, protons, and replacement electrons. The electrons move through an electron transport chain (cytochrome complex) to PS I (P700), pumping protons to make ATP via ATP synthase. At PS I, electrons are re-excited and reduce NADP⁺ to NADPH.

Comparing cyclic and non-cyclic photophosphorylation:
- Non-cyclic uses both PS I and PS II, whereas cyclic uses only PS I.
- Non-cyclic splits water and produces O₂, while cyclic does neither.
- Non-cyclic produces ATP, NADPH, and O₂, whereas cyclic produces only ATP.

In mitochondria, oxidative phosphorylation occurs on the cristae. NADH and FADH₂ donate electrons to electron transport complexes. As electrons flow to oxygen (terminal acceptor making water), protons are pumped into the intermembrane space. Protons return through ATP synthase, producing ATP by chemiosmosis."""
    else:
        essay_2_text = """Photosynthesis uses light to make food in chloroplasts, and respiration breaks down food to make ATP in mitochondria.

In light reactions, light strikes chlorophyll in PS II and PS I. Water is broken down releasing oxygen. Electrons travel down a chain to make ATP and NADPH for the Calvin cycle. Cyclic photosynthesis only uses PS I and makes ATP without making NADPH or oxygen.

In mitochondria, electron transport chain uses NADH to pump protons across the inner membrane. Oxygen accepts the electrons to form water. ATP synthase makes ATP as protons flow back."""
    answers.append({"question_id": ESSAY_IDS[1], "essay_text_answer": essay_2_text})

    # ── ESSAY 3 (Short Notes, ID 3006) ──
    if student_num in [1, 2, 3]:
        essay_3_text = """### Short Notes on Selected Biological Topics

#### (i) Counter-Current Multiplier Mechanism in the Loop of Henle
The loop of Henle establishes a hypertonic osmotic gradient in the renal medullary interstitium through counter-current multiplication. Tubular fluid flows in opposite directions in the parallel descending and ascending limbs. The thin descending limb is highly permeable to water but impermeable to sodium and chloride ions; water exits passively by osmosis into the concentrated medullary interstitium, concentrating tubular fluid up to 1200 mOsm/L at the hairpin turn. Conversely, the thick ascending limb is impermeable to water and actively transports Na⁺ and Cl⁻ out into the medullary interstitium via Na⁺/K⁺/2Cl⁻ cotransporters. This active salt expulsion elevates interstitial osmolarity, drawing more water from the descending limb, multiplying the vertical osmotic gradient from cortex (300 mOsm/L) to inner medulla (1200 mOsm/L).

#### (ii) Secondary Growth and Vascular Cambium Activity in Dicotyledonous Stems
Secondary growth increases stem diameter/girth in woody dicotyledonous plants, initiated by lateral meristems: vascular cambium and cork cambium (phellogen). The vascular cambium originates from fascicular cambium within vascular bundles and interfascicular cambium in medullary rays, forming a complete meristematic cylinder. Meristematic cells divide periclinally: daughter cells cut off towards the interior differentiate into secondary xylem (wood, including vessels, tracheids, and fibers), while cells cut off towards the exterior differentiate into secondary phloem. Secondary xylem production significantly exceeds secondary phloem, resulting in radial expansion, annual growth rings, and eventual crushing of primary cortex and epidermis.

#### (iii) Role of Photosystem I and Photosystem II in Non-Cyclic Photophosphorylation
Photosystem II (containing P680 reaction center) and Photosystem I (containing P700) operate synergistically in the thylakoid membrane. PS II absorbs light at 680 nm, initiating the light reactions; its oxidized reaction center extracts electrons via the water-splitting manganese complex (photolysis of water), generating O₂ and H⁺. Electrons energized in PS II travel through plastoquinone, cytochrome b₆f, and plastocyanin to PS I, generating an electrochemical proton gradient for ATP synthesis. PS I absorbs photons at 700 nm, elevating electrons to a higher redox state, where they are transferred via ferredoxin to NADP⁺ reductase to yield NADPH in the stroma for the Calvin cycle."""
    elif student_num in [4, 5, 6, 7, 8]:
        essay_3_text = """### Short Notes

#### (i) Counter-Current Multiplier in Loop of Henle
The loop of Henle has two limbs with opposite fluid flow. The descending limb is permeable to water, allowing water to leave by osmosis and concentrating the urine. The ascending limb is impermeable to water and actively pumps out sodium and chloride into the kidney medulla. This creates a high osmotic gradient from the cortex to the inner medulla, enabling water conservation in collecting ducts.

#### (ii) Secondary Growth in Dicot Stems
Secondary growth causes thickening of dicot stems. It is driven by the vascular cambium, which forms a continuous ring from fascicular and interfascicular cambium. Through periclinal cell divisions, it produces secondary xylem towards the inside (forming wood) and secondary phloem towards the outside. More xylem is produced than phloem, increasing stem girth and producing annual rings.

#### (iii) Role of PS I and PS II
Photosystem II (P680) absorbs light energy and excites electrons down the electron transport chain to generate ATP. It splits water by photolysis to release oxygen and replacement electrons. Photosystem I (P700) absorbs light at 700 nm to boost electrons to ferredoxin, reducing NADP⁺ to NADPH for sugar synthesis."""
    else:
        essay_3_text = """### Short Notes

#### (i) Loop of Henle
The loop of Henle has descending and ascending limbs. Water moves out in the descending limb and salt is pumped out in the ascending limb, creating a salt gradient in the kidney medulla.

#### (ii) Secondary Growth
Vascular cambium produces secondary xylem on the inside and secondary phloem on the outside. This increases the diameter of dicot stems and forms wood.

#### (iii) PS I and PS II
PS II absorbs light and splits water to make oxygen and ATP. PS I absorbs light and makes NADPH for photosynthesis."""
    answers.append({"question_id": ESSAY_IDS[2], "essay_text_answer": essay_3_text})

    return answers

# ─────────────────────────────────────────────────────────────────────────────
# 4. EXECUTION ENGINE
# ─────────────────────────────────────────────────────────────────────────────

def execute_student_assessments():
    print("=" * 90)
    print("STARTING PHASE V2: REAL STUDENT ASSESSMENT EXECUTION")
    print("=" * 90)

    db: Session = SessionLocal()
    results_summary = []

    try:
        # Clear any partial attempts from earlier aborted run to ensure fresh, clean 10-student submissions
        st_ids = [s.id for s in db.query(User.id).filter(User.role == UserRole.STUDENT).all()]
        if st_ids:
            sub_ids_to_del = [s[0] for s in db.query(ALStudentSubmission.id).filter(ALStudentSubmission.student_id.in_(st_ids)).all()]
            if sub_ids_to_del:
                db.query(ALStudentAnswer).filter(ALStudentAnswer.submission_id.in_(sub_ids_to_del)).delete(synchronize_session=False)
                db.query(ALStudentSubmission).filter(ALStudentSubmission.id.in_(sub_ids_to_del)).delete(synchronize_session=False)
                db.commit()
                print("Pre-execution cleanup: cleared partial attempts.")

        students = db.query(User).filter(User.role == UserRole.STUDENT).order_by(User.id.asc()).all()
        student_list = [s for s in students if s.email.startswith("student") and s.email.endswith("@fdp.com")]
        print(f"Loaded {len(student_list)} validation students.")

        for idx, student in enumerate(student_list, start=1):
            print("\n" + "=" * 90)
            print(f"PROCESSING STUDENT {idx}/10: {student.full_name} ({student.email})")
            print("=" * 90)

            # Step 1: Login Flow via POST /api/auth/login
            login_res = client.post(
                "/api/auth/login",
                json={"email": student.email, "password": "student123"}
            )
            assert login_res.status_code == 200, f"Login failed for {student.email}: {login_res.text}"
            token = login_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            print(f"Step 1 OK: Authenticated as {student.email}.")

            # Step 2: Open My Courses via GET /api/courses/enrolled/my-courses
            courses_res = client.get("/api/courses/enrolled/my-courses", headers=headers)
            assert courses_res.status_code == 200, f"Course listing failed: {courses_res.text}"
            enrolled = courses_res.json()
            assert len(enrolled) == 1 and enrolled[0]["id"] == 36
            print(f"Step 2 OK: Enrolled in Course 36 ('{enrolled[0]['title']}').")

            student_summary = {
                "student_id": student.id,
                "name": student.full_name,
                "email": student.email,
                "papers": {}
            }

            # ── PAPER 1: MCQ (Exam ID 210) ──
            print("\n  Executing Paper 1 MCQ (Exam 210)...")
            start_mcq = client.post("/api/al-exams/210/start", headers=headers)
            assert start_mcq.status_code == 200, f"Failed to start MCQ: {start_mcq.text}"
            mcq_sub_id = start_mcq.json()["submission_id"]
            
            mcq_answers = build_student_mcq_answers(idx)
            # Autosave answers
            save_mcq = client.put(f"/api/al-exams/submissions/{mcq_sub_id}/answers", headers=headers, json=mcq_answers)
            assert save_mcq.status_code == 200, f"Failed to autosave MCQ: {save_mcq.text}"

            # Final submit
            submit_mcq = client.post(f"/api/al-exams/submissions/{mcq_sub_id}/submit", headers=headers, json={"exam_id": 210, "answers": mcq_answers})
            assert submit_mcq.status_code == 200, f"Failed to submit MCQ: {submit_mcq.text}"
            mcq_res_obj = submit_mcq.json()
            print(f"  Paper 1 Submitted OK: SubID={mcq_sub_id}, Status='{mcq_res_obj.get('status')}', Score={mcq_res_obj.get('percentage')}%, Grade={mcq_res_obj.get('grade')}, Answers={len(mcq_answers)}/50")

            student_summary["papers"]["paper_1_mcq"] = {
                "sub_id": mcq_sub_id,
                "status": mcq_res_obj.get("status"),
                "score_pct": mcq_res_obj.get("percentage"),
                "grade": mcq_res_obj.get("grade"),
                "answered": len(mcq_answers),
                "unanswered": 50 - len(mcq_answers)
            }

            # ── PAPER 2A: STRUCTURED (Exam ID 212) ──
            print("\n  Executing Paper 2A Structured (Exam 212)...")
            start_struct = client.post("/api/al-exams/212/start", headers=headers)
            assert start_struct.status_code == 200, f"Failed to start Structured: {start_struct.text}"
            struct_sub_id = start_struct.json()["submission_id"]

            struct_answers = build_student_structured_answers(idx)
            # Autosave answers
            save_struct = client.put(f"/api/al-exams/submissions/{struct_sub_id}/answers", headers=headers, json=struct_answers)
            assert save_struct.status_code == 200, f"Failed to autosave Structured: {save_struct.text}"

            # Final submit
            submit_struct = client.post(f"/api/al-exams/submissions/{struct_sub_id}/submit", headers=headers, json={"exam_id": 212, "answers": struct_answers})
            assert submit_struct.status_code == 200, f"Failed to submit Structured: {submit_struct.text}"
            struct_res_obj = submit_struct.json()
            print(f"  Paper 2A Submitted OK: SubID={struct_sub_id}, Status='{struct_res_obj.get('status')}', Questions Answered={len(struct_answers)}/4")

            student_summary["papers"]["paper_2a_structured"] = {
                "sub_id": struct_sub_id,
                "status": struct_res_obj.get("status"),
                "answered_questions": len(struct_answers),
                "unanswered_questions": 4 - len(struct_answers)
            }

            # ── PAPER 2B: ESSAY (Exam ID 213) ──
            print("\n  Executing Paper 2B Essay (Exam 213)...")
            start_essay = client.post("/api/al-exams/213/start", headers=headers)
            assert start_essay.status_code == 200, f"Failed to start Essay: {start_essay.text}"
            essay_sub_id = start_essay.json()["submission_id"]

            essay_answers = build_student_essay_answers(idx)
            # Autosave answers
            save_essay = client.put(f"/api/al-exams/submissions/{essay_sub_id}/answers", headers=headers, json=essay_answers)
            assert save_essay.status_code == 200, f"Failed to autosave Essay: {save_essay.text}"

            # Final submit
            submit_essay = client.post(f"/api/al-exams/submissions/{essay_sub_id}/submit", headers=headers, json={"exam_id": 213, "answers": essay_answers})
            assert submit_essay.status_code == 200, f"Failed to submit Essay: {submit_essay.text}"
            essay_res_obj = submit_essay.json()
            print(f"  Paper 2B Submitted OK: SubID={essay_sub_id}, Status='{essay_res_obj.get('status')}', Essays Answered={len(essay_answers)}/3")

            student_summary["papers"]["paper_2b_essay"] = {
                "sub_id": essay_sub_id,
                "status": essay_res_obj.get("status"),
                "answered_essays": len(essay_answers),
                "unanswered_essays": 3 - len(essay_answers)
            }

            results_summary.append(student_summary)

        # Write execution summary log
        with open("scratch_v2_execution_results.json", "w", encoding="utf-8") as f:
            json.dump(results_summary, f, indent=2)

        print("\n" + "=" * 90)
        print("ALL 10 STUDENTS EXECUTED ALL 3 PAPERS SUCCESSFULLY!")
        print("=" * 90)

    finally:
        db.close()

if __name__ == "__main__":
    execute_student_assessments()
