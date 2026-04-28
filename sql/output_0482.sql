-- MySQL dump 10.13  Distrib 8.3.0, for macos12.6 (x86_64)
--
-- Host: localhost    Database: noble_msp
-- ------------------------------------------------------
-- Server version	8.3.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `api_keys`
--

DROP TABLE IF EXISTS `api_keys`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `api_keys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `api_key` varchar(255) NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `last_used_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_key` (`api_key`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `api_keys`
--

LOCK TABLES `api_keys` WRITE;
/*!40000 ALTER TABLE `api_keys` DISABLE KEYS */;
INSERT INTO `api_keys` VALUES (1,'MSP CLI','4649297677303fad18b0078b89286f672646c0aff8ad8172e91c51836f2d30c2',1,'2026-04-28 21:21:34','2026-04-15 23:09:32');
/*!40000 ALTER TABLE `api_keys` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `client_rates`
--

DROP TABLE IF EXISTS `client_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_rates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `category` enum('BUG','MAINTENANCE','CLOUD_MAINTENANCE','DATABASE','DEPLOYMENT_STAGING','DEPLOYMENT_PROD','FEATURE','HARDWARE','MEETING') NOT NULL,
  `rate` decimal(10,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_client_category` (`client_id`,`category`),
  CONSTRAINT `client_rates_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `client_rates`
--

LOCK TABLES `client_rates` WRITE;
/*!40000 ALTER TABLE `client_rates` DISABLE KEYS */;
/*!40000 ALTER TABLE `client_rates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `client_ticket_sequences`
--

DROP TABLE IF EXISTS `client_ticket_sequences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_ticket_sequences` (
  `client_id` int NOT NULL,
  `last_number` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`client_id`),
  CONSTRAINT `client_ticket_sequences_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `client_ticket_sequences`
--

LOCK TABLES `client_ticket_sequences` WRITE;
/*!40000 ALTER TABLE `client_ticket_sequences` DISABLE KEYS */;
INSERT INTO `client_ticket_sequences` VALUES (1,121);
/*!40000 ALTER TABLE `client_ticket_sequences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `clients`
--

DROP TABLE IF EXISTS `clients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `contact_name` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `invoice_prefix` varchar(20) NOT NULL,
  `default_rate` decimal(10,2) NOT NULL DEFAULT '50.00',
  `address` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_invoice_number` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_prefix` (`invoice_prefix`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clients`
--

LOCK TABLES `clients` WRITE;
/*!40000 ALTER TABLE `clients` DISABLE KEYS */;
INSERT INTO `clients` VALUES (1,'Unik Orthopedics','Charlie Chi','charlie@bwurxs.com','408-887-5842','UNIK',50.00,NULL,'2026-04-16 04:38:36','2026-04-28 21:21:34',33);
/*!40000 ALTER TABLE `clients` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `comments`
--

DROP TABLE IF EXISTS `comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticket_id` int NOT NULL,
  `body` text NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ticket_id` (`ticket_id`),
  CONSTRAINT `comments_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `comments`
--

LOCK TABLES `comments` WRITE;
/*!40000 ALTER TABLE `comments` DISABLE KEYS */;
/*!40000 ALTER TABLE `comments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoice_line_items`
--

DROP TABLE IF EXISTS `invoice_line_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoice_line_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `type` enum('TICKET','MEETING') NOT NULL,
  `reference_id` int NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `subject` varchar(500) NOT NULL,
  `hours` decimal(5,2) NOT NULL,
  `rate` decimal(10,2) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `invoice_id` (`invoice_id`),
  CONSTRAINT `invoice_line_items_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoice_line_items`
--

LOCK TABLES `invoice_line_items` WRITE;
/*!40000 ALTER TABLE `invoice_line_items` DISABLE KEYS */;
INSERT INTO `invoice_line_items` VALUES (1,1,'TICKET',2,'Bug Fix','UNIK-107: OTP Fails',4.00,50.00,200.00),(2,1,'TICKET',4,'Bug Fix','UNIK-109: Part# doesn’t show in shipping checklist',1.00,50.00,50.00),(3,1,'TICKET',3,'Maintenance','UNIK-110: Export orders column name',0.50,50.00,25.00),(4,1,'TICKET',6,'Maintenance','UNIK-112: AWS Security',2.00,50.00,100.00),(5,1,'TICKET',5,'Feature','UNIK-111: Create/Download Invoices',9.00,50.00,450.00),(6,1,'TICKET',1,'Bug Fix','UNIK-108: Part# not showing in print label',3.50,50.00,175.00),(7,1,'TICKET',9,'Deployment (Staging)','UNIK-115: v7.8.war',2.00,50.00,100.00),(8,1,'TICKET',12,'Feature','UNIK-118: Resize order list view',1.50,50.00,75.00),(9,1,'TICKET',7,'Maintenance','UNIK-113: Order list sorting',1.00,50.00,50.00),(10,1,'TICKET',10,'Cloud Maintenance','UNIK-117: AWS Cloudtrail',1.50,50.00,75.00),(11,1,'TICKET',11,'Deployment (Staging)','UNIK-116: v7.6.war',2.00,50.00,100.00),(12,1,'TICKET',13,'Bug Fix','UNIK-119: Shipping method not populated',0.75,50.00,37.50),(13,1,'TICKET',14,'Cloud Maintenance','UNIK-120: AWS EC2',1.50,50.00,75.00),(14,1,'TICKET',15,'Deployment (Staging)','UNIK-121: v7.7.war',2.00,50.00,100.00),(15,1,'MEETING',1,'Meeting','Zoom\n2026-04-03',1.00,50.00,50.00),(16,1,'MEETING',2,'Meeting','Zoom\n2026-04-10',1.00,50.00,50.00),(17,1,'MEETING',3,'Meeting','Zoom\n2026-04-10',1.33,50.00,66.50);
/*!40000 ALTER TABLE `invoice_line_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `invoices`
--

DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `invoice_number` varchar(50) NOT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date NOT NULL,
  `total_hours` decimal(8,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `status` enum('DRAFT','PENDING_APPROVAL','APPROVED','SENT','PAID') DEFAULT 'DRAFT',
  `pdf_path` varchar(500) DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `invoices`
--

LOCK TABLES `invoices` WRITE;
/*!40000 ALTER TABLE `invoices` DISABLE KEYS */;
INSERT INTO `invoices` VALUES (1,1,'UNIK-33','2026-04-28','2026-05-28',35.58,1779.00,'PENDING_APPROVAL','invoices/UNIK-33.pdf',NULL,NULL,'2026-04-28 21:21:34','2026-04-28 21:21:35');
/*!40000 ALTER TABLE `invoices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `meetings`
--

DROP TABLE IF EXISTS `meetings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `meetings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `description` varchar(500) NOT NULL,
  `meeting_date` date NOT NULL,
  `start_time` varchar(20) DEFAULT NULL,
  `end_time` varchar(20) DEFAULT NULL,
  `hours` decimal(5,2) NOT NULL,
  `invoice_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `meetings_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `meetings`
--

LOCK TABLES `meetings` WRITE;
/*!40000 ALTER TABLE `meetings` DISABLE KEYS */;
INSERT INTO `meetings` VALUES (1,1,'Zoom','2026-04-03',NULL,NULL,1.00,1,'2026-04-28 19:46:50'),(2,1,'Zoom','2026-04-10',NULL,NULL,1.00,1,'2026-04-28 19:46:50'),(3,1,'Zoom','2026-04-10',NULL,NULL,1.33,1,'2026-04-28 19:46:50');
/*!40000 ALTER TABLE `meetings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tickets`
--

DROP TABLE IF EXISTS `tickets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tickets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticket_number` varchar(50) NOT NULL,
  `client_id` int NOT NULL,
  `subject` varchar(500) NOT NULL,
  `description` text,
  `category` enum('BUG','MAINTENANCE','CLOUD_MAINTENANCE','DATABASE','DEPLOYMENT_STAGING','DEPLOYMENT_PROD','FEATURE','HARDWARE') NOT NULL,
  `priority` enum('HIGH','MEDIUM','LOW') NOT NULL DEFAULT 'MEDIUM',
  `status` enum('TODO','BACKLOG','IN_PROGRESS','DONE','CANCELLED','INVALID') NOT NULL DEFAULT 'TODO',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticket_number` (`ticket_number`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `tickets_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tickets`
--

LOCK TABLES `tickets` WRITE;
/*!40000 ALTER TABLE `tickets` DISABLE KEYS */;
INSERT INTO `tickets` VALUES (1,'UNIK-108',1,'Part# not showing in print label','if Control TAb=>manuf is NOT assigned=> when you print labels=> part# doesn’t show up if you don’t select MFG as Uniko in Control Tab. Part# = Catalog#, it should tied to implant MFG','BUG','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(2,'UNIK-107',1,'OTP Fails','Fixed OTP issue across all environments','BUG','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(3,'UNIK-110',1,'Export orders column name','In excel file generated from export orders, replace case id with Invoice#','MAINTENANCE','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(4,'UNIK-109',1,'Part# doesn’t show in shipping checklist','Change Serial# to Order# and add order id next to product_nbr; also, part# also doesn’t show.','BUG','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(5,'UNIK-111',1,'Create/Download Invoices','preview/download invoice from admin-only invoice tab','FEATURE','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(6,'UNIK-112',1,'AWS Security','created two documents to beef up aws security, high priority and low priority action items','MAINTENANCE','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(7,'UNIK-113',1,'Order list sorting','Order by in fetch orders, order by surgery date, then by, status, then by id','MAINTENANCE','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(8,'UNIK-114',1,'v7.7.war','fixed part# not showing on labels, changed text on export orders sheet, changed text in print checklist and added order id','DEPLOYMENT_STAGING','MEDIUM','IN_PROGRESS','2026-04-28 19:46:50','2026-04-28 19:46:50'),(9,'UNIK-115',1,'v7.8.war','create/download, invoices, shipping method fix','DEPLOYMENT_STAGING','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(10,'UNIK-117',1,'AWS Cloudtrail','created CloudTrail for management events','CLOUD_MAINTENANCE','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(11,'UNIK-116',1,'v7.6.war','fixed OTP bug not sending, sort order list by surgery date, status, id','DEPLOYMENT_STAGING','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(12,'UNIK-118',1,'Resize order list view','resize order list container to show more orders on render','FEATURE','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(13,'UNIK-119',1,'Shipping method not populated','shipping method not populated when order status is ‘Shipped’','BUG','MEDIUM','DONE','2026-04-28 19:46:50','2026-04-28 21:21:34'),(14,'UNIK-120',1,'AWS EC2','Enable iMDSv2 in EC2','CLOUD_MAINTENANCE','MEDIUM','DONE','2026-04-28 20:49:40','2026-04-28 21:21:34'),(15,'UNIK-121',1,'v7.7.war','fixed part# not showing on labels, changed text on export orders sheet, changed text in print checklist and added order id','DEPLOYMENT_STAGING','MEDIUM','DONE','2026-04-28 21:15:06','2026-04-28 21:21:34');
/*!40000 ALTER TABLE `tickets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `work_logs`
--

DROP TABLE IF EXISTS `work_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `work_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticket_id` int NOT NULL,
  `client_id` int NOT NULL,
  `qty` decimal(8,2) NOT NULL,
  `unit_price` decimal(10,2) DEFAULT NULL,
  `description` text,
  `worked_date` date NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ticket_id` (`ticket_id`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `work_logs_ibfk_1` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`),
  CONSTRAINT `work_logs_ibfk_2` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `work_logs`
--

LOCK TABLES `work_logs` WRITE;
/*!40000 ALTER TABLE `work_logs` DISABLE KEYS */;
INSERT INTO `work_logs` VALUES (1,2,1,4.00,NULL,'changed subject line, and created a jsp specifically for OTP emails','2026-04-08','2026-04-28 19:49:30','2026-04-28 19:49:30'),(2,11,1,2.00,NULL,'deployed v7.6.war to staging','2026-04-08','2026-04-28 19:52:31','2026-04-28 19:52:31'),(3,7,1,1.00,NULL,NULL,'2026-04-09','2026-04-28 20:45:58','2026-04-28 20:45:58'),(4,10,1,1.50,NULL,NULL,'2026-04-10','2026-04-28 20:46:29','2026-04-28 20:46:29'),(5,14,1,1.50,NULL,NULL,'2026-04-10','2026-04-28 20:51:05','2026-04-28 20:51:05'),(6,1,1,3.50,NULL,NULL,'2026-04-21','2026-04-28 20:53:59','2026-04-28 20:53:59'),(7,4,1,1.00,NULL,NULL,'2026-04-21','2026-04-28 20:54:33','2026-04-28 20:54:33'),(8,3,1,0.50,NULL,NULL,'2026-04-21','2026-04-28 20:55:05','2026-04-28 20:55:05'),(9,5,1,9.00,NULL,NULL,'2026-04-22','2026-04-28 20:55:41','2026-04-28 20:55:41'),(10,9,1,2.00,NULL,NULL,'2026-04-22','2026-04-28 20:56:11','2026-04-28 20:56:11'),(11,12,1,1.50,NULL,NULL,'2026-04-24','2026-04-28 20:57:07','2026-04-28 20:57:07'),(12,13,1,0.75,NULL,NULL,'2026-04-27','2026-04-28 20:57:59','2026-04-28 20:57:59'),(13,6,1,2.00,NULL,NULL,'2026-04-03','2026-04-28 21:02:42','2026-04-28 21:02:42'),(14,15,1,2.00,NULL,'fixed part# not showing on labels, changed text on export orders sheet, changed text in print checklist and added order id','2026-04-09','2026-04-28 21:16:22','2026-04-28 21:16:22');
/*!40000 ALTER TABLE `work_logs` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-28 14:42:31
